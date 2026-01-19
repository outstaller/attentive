// ============================================================================
// Teacher Network Service
// ============================================================================
// Handles the backend logic for the Teacher mode:
// 1. Broadcasts UDP beacons so students can discover the class.
// 2. Runs a Socket.IO server to maintain connections with students.
// 3. Manages student state (locked, active, disconnected).

import dgram from 'dgram';
import crypto from 'crypto';
import { Server as SocketIOServer, Socket } from 'socket.io';
import http from 'http';
import { ipcMain, WebContents } from 'electron';
import { UDP_PORT, TCP_PORT, CHANNELS } from '../shared/constants';
import { Student, PacketType, BeaconPacket } from '../shared/types';
import * as ip from 'ip';
import os from 'os';

export class TeacherNetworkService {
    private udpSocket: dgram.Socket | null = null;
    private io: SocketIOServer | null = null;
    private httpServer: http.Server | null = null;

    // Timer for sending UDP beacons every 2 seconds
    private beaconTimer: NodeJS.Timeout | null = null;

    // Active student tracking
    private students: Map<string, Student> = new Map(); // Mapped by UniqueID (Name+Grade)
    private socketToStudentId: Map<string, string> = new Map(); // Helper for disconnects

    private isClassLocked: boolean = false;
    private mainWindow: WebContents;

    // Configurable Auto-Unlock Timer (default 60m)
    private lockTimeout: number = 60;

    /**
     * Sends a log entry to the UI renderer process.
     */
    private log(message: string, type: 'info' | 'warning' | 'error' = 'info') {
        if (!this.mainWindow.isDestroyed()) {
            this.mainWindow.send(CHANNELS.LOG_ENTRY, {
                timestamp: Date.now(),
                message,
                type
            });
        }
    }

    private password: string = '';
    private currentSessionId: string = '';

    constructor(webContents: WebContents) {
        this.mainWindow = webContents;
    }

    /**
     * initializes the Class Session.
     * @param className The name to modify in beacons
     * @param teacherName The teacher's display name
     * @param password Optional password for the class
     * @param lockTimeout Auto-unlock duration in minutes
     */
    public async start(className: string, teacherName: string, password?: string, lockTimeout?: number) {
        this.password = password || '';
        this.lockTimeout = lockTimeout || 60;
        this.currentSessionId = crypto.randomUUID();

        // Start broadcasting existence
        this.startUDPServer(className, teacherName);

        // Start listening for connections
        this.startSocketServer();

        this.log(`הכיתה נפתחה (זמן נעילה אוטומטי: ${this.lockTimeout} דקות)`, 'info');
    }

    /**
     * Stops all network services and clears state.
     */
    public stop() {
        if (this.beaconTimer) clearInterval(this.beaconTimer);

        if (this.udpSocket) this.udpSocket.close();
        if (this.io) this.io.close();
        if (this.httpServer) this.httpServer.close();

        this.students.clear();
        this.socketToStudentId.clear();
    }

    /**
     * Sets up the UDP Broadcast mechanism.
     * broadcast packets to port 41234 on all interfaces.
     */
    private startUDPServer(className: string, teacherName: string) {
        this.udpSocket = dgram.createSocket('udp4');

        // Allow broadcast
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

        // Broadcast Loop (every 2 seconds)
        this.beaconTimer = setInterval(() => {
            const interfaces = os.networkInterfaces();

            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name] || []) {
                    // Skip internal (127.0.0.1) and non-IPv4
                    if (iface.family === 'IPv4' && !iface.internal) {

                        // Calculate Broadcast Address - Fallback to .255 assumption
                        // This allows broadcast to work on subnet x.x.x.255
                        const parts = iface.address.split('.');
                        parts[3] = '255';
                        const broadcastAddr = parts.join('.');

                        // Update packet with the correct IP for this interface so student connects to right one
                        const interfacePacket = { ...packet, ip: iface.address };
                        const message = Buffer.from(JSON.stringify(interfacePacket));

                        this.udpSocket?.send(message, UDP_PORT, broadcastAddr, (err) => {
                            if (err) console.error(`Error sending beacon on ${name}:`, err);
                        });

                        // Also try global broadcast 255.255.255.255 as fallback
                        this.udpSocket?.send(message, UDP_PORT, '255.255.255.255', () => { });
                    }
                }
            }
        }, 2000);
    }

    /**
     * Sets up the TCP Socket.IO server for reliable communication.
     */
    private startSocketServer() {
        this.httpServer = http.createServer();
        this.io = new SocketIOServer(this.httpServer, {
            cors: { origin: '*' }
        });

        // Middleware for password verification
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
            console.log('Student connected:', socket.id);

            // Expect student to send their info immediately
            socket.on(CHANNELS.SET_USER_INFO, (info: { name: string; grade: string }) => {
                const uniqueId = `${info.name}_${info.grade}`;
                let student = this.students.get(uniqueId);

                if (student) {
                    // Student Reconnecting (e.g., app restarted or network blip)
                    student.socketId = socket.id;
                    student.status = this.isClassLocked ? 'locked' : 'active';
                    student.lastSeen = Date.now();
                    student.connectedAt = Date.now();
                    student.ip = socket.handshake.address;
                } else {
                    // New Connection
                    student = {
                        id: uniqueId,
                        socketId: socket.id,
                        name: info.name,
                        grade: info.grade,
                        ip: socket.handshake.address,
                        status: this.isClassLocked ? 'locked' : 'active',
                        lastSeen: Date.now(),
                        connectedAt: Date.now(),
                        totalDuration: 0
                    };
                }

                this.students.set(uniqueId, student);
                this.socketToStudentId.set(socket.id, uniqueId);

                this.broadcastStudentList();

                this.log(`תלמיד התחבר: ${info.name} (כיתה ${info.grade})`, 'info');

                // If class is currently locked, lock the new student immediately
                if (this.isClassLocked) {
                    socket.emit(CHANNELS.LOCK_STUDENT, { timeout: this.lockTimeout });
                }
            });

            socket.on('disconnect', () => {
                const uniqueId = this.socketToStudentId.get(socket.id);
                if (uniqueId) {
                    const student = this.students.get(uniqueId);
                    if (student) {
                        student.status = 'disconnected';

                        // Update total duration session time
                        if (student.connectedAt) {
                            student.totalDuration = (student.totalDuration || 0) + (Date.now() - student.connectedAt);
                            student.connectedAt = undefined;
                        }

                        student.socketId = undefined; // Clear socket ID so we know they are gone
                        this.log(`תלמיד התנתק: ${student.name}`, 'warning');
                    }
                    this.socketToStudentId.delete(socket.id);
                } else {
                    this.log(`חיבור התנתק (לא מזוהה): ${socket.id}`, 'warning');
                }

                this.broadcastStudentList();
            });
        });

        this.httpServer.listen(TCP_PORT, () => {
            console.log(`Socket.io Server running on port ${TCP_PORT}`);
        });
    }

    /**
     * Locks the entire class.
     * Broadcasts the LOCK signal with the configured timeout.
     */
    public lockAll() {
        this.isClassLocked = true;
        this.io?.emit(CHANNELS.LOCK_STUDENT, { timeout: this.lockTimeout });
        this.updateAllStatuses('locked');
        this.log('הכיתה ננעלה', 'warning');
    }

    public unlockAll() {
        this.isClassLocked = false;
        this.io?.emit(CHANNELS.UNLOCK_STUDENT);
        this.updateAllStatuses('active');
        this.log('הכיתה שוחררה', 'info');
    }

    /**
     * Locks a specific student.
     */
    public lockStudent(uniqueId: string) {
        const student = this.students.get(uniqueId);
        if (student) {
            if (student.socketId) {
                this.io?.to(student.socketId).emit(CHANNELS.LOCK_STUDENT, { timeout: this.lockTimeout });
            }
            this.updateStudentStatus(uniqueId, 'locked');
            this.log(`תלמיד ננעל: ${student.name}`, 'warning');
        }
    }

    public unlockStudent(uniqueId: string) {
        const student = this.students.get(uniqueId);
        if (student) {
            if (student.socketId) {
                this.io?.to(student.socketId).emit(CHANNELS.UNLOCK_STUDENT);
            }
            this.updateStudentStatus(uniqueId, 'active');
            this.log(`תלמיד שוחרר: ${student.name}`, 'info');
        }
    }

    public kickStudent(uniqueId: string) {
        const student = this.students.get(uniqueId);
        if (student && student.socketId) {
            this.io?.to(student.socketId).emit(CHANNELS.KICK_STUDENT);
            const socket = this.io?.sockets.sockets.get(student.socketId);
            if (socket) {
                socket.disconnect(true);
            }
        }
    }

    public kickAll() {
        this.io?.emit(CHANNELS.KICK_STUDENT);
        this.io?.sockets.sockets.forEach((socket) => {
            socket.disconnect(true);
        });
        // The disconnect handlers will clean up state
        this.log('כל התלמידים המחוברים נותקו', 'warning');
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
