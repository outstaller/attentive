// ============================================================================
// Teacher Network Service
// ============================================================================
// Handles the backend logic for the Teacher mode:
// 1. LAN: Broadcasts UDP beacons, Runs Socket.IO Server.
// 2. INTERNET: Connects to Relay Server, Registers presence.
// 3. Manages student state (locked, active, disconnected).

import dgram from 'dgram';
import crypto from 'crypto';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { io, Socket as ClientSocket } from 'socket.io-client';
import http from 'http';
import { ipcMain, WebContents } from 'electron';
import { UDP_PORT, TCP_PORT, CHANNELS } from '../shared/constants';
import { Student, PacketType, BeaconPacket } from '../shared/types';
import { ConfigManager } from '../shared/config';
import * as ip from 'ip';
import os from 'os';

export class TeacherNetworkService {
    // LAN Objects
    private udpSocket: dgram.Socket | null = null;
    private io: SocketIOServer | null = null;
    private httpServer: http.Server | null = null;

    // Internet Objects
    private relaySocket: ClientSocket | null = null;

    // Common
    private beaconTimer: NodeJS.Timeout | null = null;
    private students: Map<string, Student> = new Map(); // Mapped by UniqueID (Name+Grade)
    private socketToStudentId: Map<string, string> = new Map(); // Helper for disconnects

    private isClassLocked: boolean = false;
    private mainWindow: WebContents;

    // Config
    private lockTimeout: number = 60;
    private config = ConfigManager.getInstance().getConfig();

    private password: string = '';
    private currentSessionId: string = '';

    constructor(webContents: WebContents) {
        this.mainWindow = webContents;
    }

    private log(message: string, type: 'info' | 'warning' | 'error' = 'info') {
        if (!this.mainWindow.isDestroyed()) {
            this.mainWindow.send(CHANNELS.LOG_ENTRY, {
                timestamp: Date.now(),
                message,
                type
            });
        }
    }

    public async start(className: string, teacherName: string, password?: string, lockTimeout?: number): Promise<void> {
        this.password = password || '';
        this.lockTimeout = lockTimeout || 60;
        this.currentSessionId = crypto.randomUUID();

        // Refresh config (in case it changed)
        this.config = ConfigManager.getInstance().getConfig();

        this.log(`מנסה לפתוח כיתה (מצב: ${this.config.mode})`, 'info');

        if (this.config.mode === 'LAN') {
            this.startLocalMode(className, teacherName);
            this.log(`הכיתה נפתחה (מצב: ${this.config.mode}, נעילה: ${this.lockTimeout} דקות)`, 'info');
            return Promise.resolve();
        } else {
            try {
                await this.startInternetMode(className, teacherName);
                this.log(`הכיתה נפתחה (מצב: ${this.config.mode}, נעילה: ${this.lockTimeout} דקות)`, 'info');
            } catch (err: any) {
                console.error('Failed to start Internet Mode:', err);
                this.log(`שגיאה בחיבור לשרת: ${err.message}`, 'error');
                throw err;
            }
        }
    }

    public async shutdown(): Promise<void> {
        if (this.students.size > 0) {
            this.log('סוגר כיתה: מנתק את כל התלמידים...', 'warning');
            this.kickAll();
            // Give sockets a moment to flush the kick packet
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        this.stop();
    }

    public stop() {
        if (this.beaconTimer) clearInterval(this.beaconTimer);

        // Stop LAN
        if (this.udpSocket) {
            this.udpSocket.close();
            this.udpSocket = null;
        }
        if (this.io) {
            this.io.close();
            this.io = null;
        }
        if (this.httpServer) {
            this.httpServer.close();
            this.httpServer = null;
        }

        // Stop Internet
        if (this.relaySocket) {
            this.relaySocket.disconnect(); // This triggers removal on Relay Server
            this.relaySocket = null;
        }

        this.students.clear();
        this.socketToStudentId.clear();
    }

    // =========================================================================
    // LAN Implementation
    // =========================================================================

    private startLocalMode(className: string, teacherName: string) {
        this.startUDPServer(className, teacherName);
        this.startSocketServer();
    }

    private startUDPServer(className: string, teacherName: string) {
        this.udpSocket = dgram.createSocket('udp4');
        this.udpSocket.bind(() => {
            this.udpSocket?.setBroadcast(true);
            console.log('UDP Beacon started');
        });

        const localIp = ip.address();
        const packet: BeaconPacket = {
            type: PacketType.BEACON,
            teacher: teacherName,
            class: className,
            ip: localIp,
            port: TCP_PORT,
            isSecured: !!this.password,
            sessionId: this.currentSessionId,
        };

        this.beaconTimer = setInterval(() => {
            const interfaces = os.networkInterfaces();
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name] || []) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        const parts = iface.address.split('.');
                        parts[3] = '255';
                        const broadcastAddr = parts.join('.');

                        const interfacePacket = { ...packet, ip: iface.address };
                        const message = Buffer.from(JSON.stringify(interfacePacket));

                        this.udpSocket?.send(message, UDP_PORT, broadcastAddr, (err) => {
                            if (err) console.error(`Error sending beacon on ${name}:`, err);
                        });
                        this.udpSocket?.send(message, UDP_PORT, '255.255.255.255', () => { });
                    }
                }
            }
        }, 2000);
    }

    private startSocketServer() {
        this.httpServer = http.createServer();
        this.io = new SocketIOServer(this.httpServer, {
            cors: { origin: '*' }
        });

        this.io.use((socket, next) => {
            if (this.password) {
                const handshakePassword = socket.handshake.auth.password;
                if (handshakePassword !== this.password) {
                    return next(new Error('Invalid password'));
                }
            }
            next();
        });

        this.io.on('connection', (socket: Socket) => {
            this.handleNewStudentConnection(socket.id, socket.handshake.address, socket);
        });

        this.httpServer.listen(TCP_PORT, () => {
            console.log(`Socket.io Server running on port ${TCP_PORT}`);
        });
    }

    // =========================================================================
    // Internet Implementation (Relay)
    // =========================================================================

    private startInternetMode(className: string, teacherName: string): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log(`Connecting to Relay: ${this.config.relayUrl}`);

            this.relaySocket = io(this.config.relayUrl, {
                reconnectionAttempts: 3,
                timeout: 5000
            });

            // --- Setup Relay Event Listeners ---

            // 1. Connection Logic
            const connectionTimeout = setTimeout(() => {
                // If we are still pending (not resolved/rejected by ack), we time out.
                // We don't check .connected only, because we might be connected but waiting for Ack.
                console.error("Registration timed out.");
                if (this.relaySocket) this.relaySocket.disconnect();
                reject(new Error('Connection/Registration to Relay Server timed out'));
            }, 7000);

            this.relaySocket.on('connect_error', (err) => {
                console.error('Relay connection error:', err);
            });

            this.relaySocket.on('connect', () => {
                console.log('Connected to Relay. Registering...');
                this.relaySocket?.emit('register_teacher', {
                    name: teacherName,
                    className: className,
                    isSecured: !!this.password
                }, (response: any) => {
                    clearTimeout(connectionTimeout);
                    if (response && response.success) {
                        console.log('Registration acknowledged by Relay.');
                        resolve();
                    } else {
                        // Pass the error from the server if available
                        const errorMsg = response?.error || 'Relay Server rejected registration.';
                        reject(new Error(errorMsg));
                    }
                });
            });

            // 2. Incoming Logic (Student Joins)
            this.relaySocket.on('student_joined_relay', (data: { studentSocketId: string, info: { name: string, grade: string, password?: string } }) => {
                // Password check
                if (this.password && data.info.password !== this.password) {
                    this.kickRemoteStudent(data.studentSocketId);
                    return;
                }

                // Treat as a regular connection
                this.handleNewStudentConnection(data.studentSocketId, 'RelayIP', null, data.info);
            });
        });
    }

    // =========================================================================
    // Unified Student Management
    // =========================================================================

    private handleNewStudentConnection(socketId: string, ipAddr: string, directSocket: Socket | null, preInfo?: { name: string; grade: string }) {
        console.log('Student connected:', socketId);

        const registerStudent = (info: { name: string; grade: string }) => {
            const uniqueId = `${info.name}_${info.grade}`;
            let student = this.students.get(uniqueId);

            if (student) {
                // Reconnect
                student.socketId = socketId;
                student.status = this.isClassLocked ? 'locked' : 'active';
                student.lastSeen = Date.now();
                student.connectedAt = Date.now();
                student.ip = ipAddr;
            } else {
                // New
                student = {
                    id: uniqueId,
                    socketId: socketId,
                    name: info.name,
                    grade: info.grade,
                    ip: ipAddr,
                    status: this.isClassLocked ? 'locked' : 'active',
                    lastSeen: Date.now(),
                    connectedAt: Date.now(),
                    totalDuration: 0
                };
            }

            this.students.set(uniqueId, student);
            this.socketToStudentId.set(socketId, uniqueId);
            this.broadcastStudentList();
            this.log(`תלמיד התחבר: ${info.name} (כיתה ${info.grade})`, 'info');

            // Send Lock signal if needed
            if (this.isClassLocked) {
                this.sendToStudent(socketId, CHANNELS.LOCK_STUDENT, { timeout: this.lockTimeout });
            }

            // Listen for disconnect (if direct)
            if (directSocket) {
                directSocket.on('disconnect', () => {
                    this.handleStudentDisconnect(socketId);
                });
            }
        };

        if (directSocket) {
            directSocket.on(CHANNELS.SET_USER_INFO, (info) => registerStudent(info));
        } else if (preInfo) {
            // For Relay, we already got the info in the join event
            registerStudent(preInfo);
        }
    }

    private handleStudentDisconnect(socketId: string) {
        const uniqueId = this.socketToStudentId.get(socketId);
        if (uniqueId) {
            const student = this.students.get(uniqueId);
            if (student) {
                student.status = 'disconnected';
                if (student.connectedAt) {
                    student.totalDuration = (student.totalDuration || 0) + (Date.now() - student.connectedAt);
                    student.connectedAt = undefined;
                }
                student.socketId = undefined;
                this.log(`תלמיד התנתק: ${student.name}`, 'warning');
            }
            this.socketToStudentId.delete(socketId);
        }
        this.broadcastStudentList();
    }

    // =========================================================================
    // Communication Abstraction
    // =========================================================================

    private sendToStudent(socketId: string, event: string, data?: any) {
        if (this.config.mode === 'LAN') {
            this.io?.to(socketId).emit(event, data);
        } else {
            this.relaySocket?.emit('relay_message', {
                targetSocketId: socketId,
                event,
                data
            });
        }
    }

    private broadcastToAll(event: string, data?: any) {
        if (this.config.mode === 'LAN') {
            this.io?.emit(event, data);
        } else {
            // For Relay, we iterate known students or send to our "room" if we implemented it.
            // Since we track students manually, we can iterate for now or ask Relay to broadcast.
            // Iterating is safer given current simple Relay implementation.
            this.students.forEach(s => {
                if (s.socketId && s.status !== 'disconnected') {
                    this.sendToStudent(s.socketId, event, data);
                }
            });
        }
    }

    private kickRemoteStudent(socketId: string) {
        // In Relay mode, send a kick signal
        this.relaySocket?.emit('relay_message', {
            targetSocketId: socketId,
            event: CHANNELS.KICK_STUDENT
        });
        // Also tell relay to drop?
    }

    // =========================================================================
    // Public Actions (UI Triggers)
    // =========================================================================

    public lockAll() {
        this.isClassLocked = true;
        this.broadcastToAll(CHANNELS.LOCK_STUDENT, { timeout: this.lockTimeout });
        this.updateAllStatuses('locked');
        this.log('הכיתה ננעלה', 'warning');
    }

    public unlockAll() {
        this.isClassLocked = false;
        this.broadcastToAll(CHANNELS.UNLOCK_STUDENT);
        this.updateAllStatuses('active');
        this.log('הכיתה שוחררה', 'info');
    }

    public lockStudent(uniqueId: string) {
        const student = this.students.get(uniqueId);
        if (student && student.socketId) {
            this.sendToStudent(student.socketId, CHANNELS.LOCK_STUDENT, { timeout: this.lockTimeout });
        }
        this.updateStudentStatus(uniqueId, 'locked');
        this.log(`תלמיד ננעל: ${student?.name}`, 'warning');
    }

    public unlockStudent(uniqueId: string) {
        const student = this.students.get(uniqueId);
        if (student && student.socketId) {
            this.sendToStudent(student.socketId, CHANNELS.UNLOCK_STUDENT);
        }
        this.updateStudentStatus(uniqueId, 'active');
        this.log(`תלמיד שוחרר: ${student?.name}`, 'info');
    }

    public kickStudent(uniqueId: string) {
        const student = this.students.get(uniqueId);
        if (student && student.socketId) {
            this.sendToStudent(student.socketId, CHANNELS.KICK_STUDENT);

            if (this.config.mode === 'LAN') {
                const socket = this.io?.sockets.sockets.get(student.socketId);
                socket?.disconnect(true);
            }

            // Clean up immediately
            this.handleStudentDisconnect(student.socketId);
        }
    }

    public kickAll() {
        this.broadcastToAll(CHANNELS.KICK_STUDENT);

        if (this.config.mode === 'LAN') {
            this.io?.sockets.sockets.forEach((socket) => {
                socket.disconnect(true);
            });
        } else {
            // For relay, we just sent the message. 
            // We can locally clear state.
        }

        this.log('כל התלמידים המחוברים נותקו', 'warning');

        // Reset state
        this.students.forEach(s => {
            if (s.socketId) this.handleStudentDisconnect(s.socketId);
        });
    }

    private updateAllStatuses(status: 'active' | 'locked') {
        this.students.forEach(s => {
            if (s.status !== 'disconnected') {
                s.status = status;
            }
        });
        this.broadcastStudentList();
    }

    private updateStudentStatus(uniqueId: string, status: 'active' | 'locked') {
        const s = this.students.get(uniqueId);
        if (s) {
            s.status = status;
            this.broadcastStudentList();
        }
    }

    private broadcastStudentList() {
        if (!this.mainWindow.isDestroyed()) {
            this.mainWindow.send(CHANNELS.GET_STUDENTS, Array.from(this.students.values()));
        }
    }
}
