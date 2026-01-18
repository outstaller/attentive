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
    private beaconTimer: NodeJS.Timeout | null = null;
    private students: Map<string, Student> = new Map(); // socketId -> Student
    private isClassLocked: boolean = false;
    private mainWindow: WebContents;

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

    public async start(className: string, teacherName: string, password?: string) {
        this.password = password || '';
        this.currentSessionId = crypto.randomUUID();
        this.startUDPServer(className, teacherName);
        this.startSocketServer();
    }

    public stop() {
        if (this.beaconTimer) clearInterval(this.beaconTimer);
        if (this.udpSocket) this.udpSocket.close();
        if (this.io) this.io.close();
        if (this.httpServer) this.httpServer.close();
        this.students.clear();
    }

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

        this.beaconTimer = setInterval(() => {
            const interfaces = os.networkInterfaces();

            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name] || []) {
                    // Skip internal (127.0.0.1) and non-IPv4
                    if (iface.family === 'IPv4' && !iface.internal) {

                        // Calculate Broadcast Address - Fallback to .255 assumption
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

            socket.on(CHANNELS.SET_USER_INFO, (info: { name: string; grade: string }) => {
                const student: Student = {
                    id: socket.id,
                    name: info.name,
                    grade: info.grade,
                    ip: socket.handshake.address,
                    status: this.isClassLocked ? 'locked' : 'active',
                    lastSeen: Date.now(),
                };
                this.students.set(socket.id, student);
                this.broadcastStudentList();

                this.broadcastStudentList();

                this.log(`תלמיד התחבר: ${info.name} (כיתה ${info.grade})`, 'info');

                // Sync lock state
                if (this.isClassLocked) {
                    socket.emit(CHANNELS.LOCK_STUDENT);
                }
            });

            socket.on('disconnect', () => {
                const s = this.students.get(socket.id);
                if (s) {
                    this.log(`תלמיד התנתק: ${s.name}`, 'warning');
                } else {
                    this.log(`חיבור התנתק (לא מזוהה): ${socket.id}`, 'warning');
                }
                this.students.delete(socket.id);
                this.broadcastStudentList();
            });
        });

        this.httpServer.listen(TCP_PORT, () => {
            console.log(`Socket.io Server running on port ${TCP_PORT}`);
        });
    }

    public lockAll() {
        this.isClassLocked = true;
        this.io?.emit(CHANNELS.LOCK_STUDENT);
        this.updateAllStatuses('locked');
        this.log('הכיתה ננעלה', 'warning');
    }

    public unlockAll() {
        this.isClassLocked = false;
        this.io?.emit(CHANNELS.UNLOCK_STUDENT);
        this.updateAllStatuses('active');
        this.log('הכיתה שוחררה', 'info');
    }

    public lockStudent(socketId: string) {
        this.io?.to(socketId).emit(CHANNELS.LOCK_STUDENT);
        this.updateStudentStatus(socketId, 'locked');

        const s = this.students.get(socketId);
        this.log(`תלמיד ננעל: ${s ? s.name : socketId}`, 'warning');
    }

    public unlockStudent(socketId: string) {
        this.io?.to(socketId).emit(CHANNELS.UNLOCK_STUDENT);
        this.updateStudentStatus(socketId, 'active');

        const s = this.students.get(socketId);
        this.log(`תלמיד שוחרר: ${s ? s.name : socketId}`, 'info');
    }

    public kickStudent(socketId: string) {
        this.io?.to(socketId).emit(CHANNELS.KICK_STUDENT);
        const socket = this.io?.sockets.sockets.get(socketId);
        if (socket) {
            socket.disconnect(true);
        }
        // The disconnect handler will clean up the map and broadcast
    }

    public kickAll() {
        this.io?.emit(CHANNELS.KICK_STUDENT);
        this.io?.sockets.sockets.forEach((socket) => {
            socket.disconnect(true);
        });
        // The disconnect handlers will clean up
        this.log('כל התלמידים המחוברים נותקו', 'warning');
    }

    private updateAllStatuses(status: 'active' | 'locked') {
        this.students.forEach(s => s.status = status);
        this.broadcastStudentList();
    }

    private updateStudentStatus(id: string, status: 'active' | 'locked') {
        const s = this.students.get(id);
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
