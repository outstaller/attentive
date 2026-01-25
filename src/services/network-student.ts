// ============================================================================
// Student Network Service
// ============================================================================
// Handles the client-side logic for the Student mode:
// 1. LAN: Listens for UDP beacons. Connects directly to Teacher IP.
// 2. INTERNET: Connects to Relay. Fetches Class List. Connects via Relay.
// 3. Handles Lock/Unlock signals and manages the local auto-unlock timer.

import dgram from 'dgram';
import { io, Socket } from 'socket.io-client';
import { ipcMain, WebContents } from 'electron';
import { UDP_PORT, CHANNELS } from '../shared/constants';
import { PacketType, BeaconPacket } from '../shared/types';
import { ConfigManager } from '../shared/config';

export class StudentNetworkService {
    // LAN Objects
    private udpSocket: dgram.Socket | null = null;

    // Remote / Common Objects
    private socket: Socket | null = null; // Used for both LAN (direct) and Internet (Relay)

    private mainWindow: WebContents;
    private connectedClass: { ip: string; port: number } | null = null;
    private wasKicked: boolean = false;
    // Timer to auto-unlock if the teacher disappears or app crashes
    private unlockTimer: NodeJS.Timeout | null = null;

    // Config
    private config = ConfigManager.getInstance().getConfig();
    private discoveryTimer: NodeJS.Timeout | null = null;

    constructor(webContents: WebContents) {
        this.mainWindow = webContents;
    }

    public updateWebContents(webContents: WebContents) {
        this.mainWindow = webContents;
    }

    public startDiscovery() {
        this.config = ConfigManager.getInstance().getConfig(); // Refresh config

        if (this.config.mode === 'LAN') {
            this.startLanDiscovery();
        } else {
            this.startInternetDiscovery();
        }
    }

    public stopDiscovery() {
        if (this.udpSocket) {
            this.udpSocket.close();
            this.udpSocket = null;
        }
        if (this.discoveryTimer) {
            clearInterval(this.discoveryTimer);
            this.discoveryTimer = null;
        }
    }

    // =========================================================================
    // LAN Discovery
    // =========================================================================

    private startLanDiscovery() {
        this.udpSocket = dgram.createSocket('udp4');
        this.udpSocket.on('message', (msg, rinfo) => {
            try {
                const packet = JSON.parse(msg.toString()) as BeaconPacket;
                if (packet.type === PacketType.BEACON) {
                    // Always prefer the actual Sender IP (rinfo.address)
                    packet.ip = rinfo.address;

                    // Send found class to UI
                    if (!this.mainWindow.isDestroyed()) {
                        this.mainWindow.send(CHANNELS.TEACHER_BEACON, packet);
                    }
                }
            } catch (e) {
                // Ignore invalid packets
            }
        });

        this.udpSocket.bind(UDP_PORT, () => {
            console.log('Student listening for beacons on port', UDP_PORT);
            this.udpSocket?.setBroadcast(true);
        });
    }

    // =========================================================================
    // Internet Discovery (Relay)
    // =========================================================================

    private startInternetDiscovery() {
        // In Internet mode, we connect to the Relay to fetch classes.
        // If we are not already connected to relay, connect now.
        if (!this.socket || !this.socket.connected) {
            this.socket = io(this.config.relayUrl, {
                transports: ['websocket'],
                reconnectionAttempts: 5
            });
        }

        // Poll for classes every 5 seconds
        const fetchClasses = () => {
            if (this.socket && this.socket.connected) {
                this.socket.emit('get_classes', (classes: any[]) => {
                    classes.forEach(c => {
                        // Map Relay Teacher Data to BeaconPacket
                        const packet: BeaconPacket = {
                            type: PacketType.BEACON,
                            teacher: c.name,
                            class: c.className,
                            ip: 'RELAY', // Special flag handled by connect logic
                            port: 0,
                            isSecured: c.isSecured,
                            sessionId: c.sessionId,
                            relayId: c.socketId // Teacher's Socket ID on Relay
                        };

                        if (!this.mainWindow.isDestroyed()) {
                            this.mainWindow.send(CHANNELS.TEACHER_BEACON, packet);
                        }
                    });
                });
            }
        };

        this.socket.on('connect', () => {
            console.log('Connected to Relay for Discovery');
            fetchClasses();
        });

        this.discoveryTimer = setInterval(fetchClasses, 5000);
    }

    // =========================================================================
    // Connection Logic
    // =========================================================================

    public connectToClass(ip: string, port: number, info: { name: string; grade: string }, password?: string, teacherInfo?: { teacherName: string; className: string, relayId?: string }) {
        // If we were polling in Internet mode, stop polling but keep socket if it's the relay one
        this.stopDiscovery();

        if (this.config.mode === 'LAN') {
            this.connectLan(ip, port, info, password, teacherInfo);
        } else {
            this.connectInternet(teacherInfo?.relayId || '', info, password, teacherInfo);
        }
    }

    private connectLan(ip: string, port: number, info: { name: string; grade: string }, password?: string, teacherInfo?: any) {
        if (this.socket) this.socket.disconnect();

        this.connectedClass = { ip, port };

        // Handle IPv6 (e.g., ::1 needs [::1])
        const host = ip.includes(':') ? `[${ip}]` : ip;
        const url = `http://${host}:${port}`;

        console.log(`[LAN] Attempting connection to: ${url}`);

        try {
            this.socket = io(url, {
                auth: { password },
                transports: ['websocket'],
                reconnectionAttempts: 3,
                forceNew: true
            });

            this.setupSocketHandlers(teacherInfo);

            this.socket.on('connect', () => { // LAN Connect
                console.log('[LAN] Socket connected successfully!');
                if (!this.mainWindow.isDestroyed()) {
                    this.mainWindow.send(CHANNELS.STUDENT_STATUS_UPDATE, 'connected');
                }
                this.wasKicked = false;
                this.socket?.emit(CHANNELS.SET_USER_INFO, info);
            });
        } catch (e) {
            console.error('[LAN] Connection Fatal Error:', e);
            if (!this.mainWindow.isDestroyed()) {
                this.mainWindow.send(CHANNELS.STUDENT_STATUS_UPDATE, 'error', 'Fatal Connection Error');
            }
        }
    }

    private connectInternet(teacherRelayId: string, info: { name: string; grade: string }, password?: string, teacherInfo?: any) {
        // We reuse the existing socket if it's connected to Relay
        if (!this.socket || !this.socket.connected) {
            this.socket = io(this.config.relayUrl);
        }

        // We need to setup handlers before joining?
        // Actually, we might have set them up during discovery? No, discovery didn't attach lock listeners.
        // We need to attach listeners now.
        // BEWARE: If we re-attach listeners on the same socket multiple times, we get duplicates.
        // Ideally we wipe listeners first.
        this.socket.removeAllListeners();

        // Handle basic connect (if we just created it)
        // If already connected, this won't fire immediately?
        if (this.socket.connected) {
            this.performRelayJoin(teacherRelayId, info, password);
        } else {
            this.socket.on('connect', () => {
                this.performRelayJoin(teacherRelayId, info, password);
            });
        }

        this.setupSocketHandlers(teacherInfo);
    }

    private performRelayJoin(teacherRelayId: string, info: { name: string; grade: string }, password?: string) {
        console.log('Joining class via Relay:', teacherRelayId);
        this.socket?.emit('join_class', {
            teacherSocketId: teacherRelayId,
            studentInfo: { ...info, password }
        });

        // We assume success for now, or wait for 'student_joined' conf?
        // Let's assume connected state upon sending join
        if (!this.mainWindow.isDestroyed()) {
            this.mainWindow.send(CHANNELS.STUDENT_STATUS_UPDATE, 'connected');
        }
        this.wasKicked = false;
    }

    private setupSocketHandlers(teacherInfo?: { teacherName: string; className: string }) {
        if (!this.socket) return;

        this.socket.on('connect_error', (err) => {
            console.error('Socket connect_error:', err.message);
            if (!this.mainWindow.isDestroyed()) {
                this.mainWindow.send(CHANNELS.STUDENT_STATUS_UPDATE, 'error', err.message);
            }
        });

        const handleLock = (data: any) => {
            const lockData = {
                ...data,
                teacherName: teacherInfo?.teacherName,
                className: teacherInfo?.className
            };
            ipcMain.emit(CHANNELS.LOCK_STUDENT, undefined, lockData);

            if (this.unlockTimer) clearTimeout(this.unlockTimer);
            if (data?.timeout) {
                this.unlockTimer = setTimeout(() => {
                    ipcMain.emit(CHANNELS.UNLOCK_STUDENT);
                    this.unlockTimer = null;
                }, data.timeout * 60 * 1000);
            }
        };

        const handleUnlock = () => {
            if (this.unlockTimer) {
                clearTimeout(this.unlockTimer);
                this.unlockTimer = null;
            }
            ipcMain.emit(CHANNELS.UNLOCK_STUDENT, undefined);
        };

        const handleKick = () => {
            this.wasKicked = true;
            // Force disconnection logic
            console.log('Received kick signal from teacher.');

            // If we are in Relay mode, we are connected to the relay, not the teacher directly.
            // But we treat 'kick' as being removed from the class context.
            // We should stop listening to class events or disconnect entirely.

            // For consistent UX with LAN mode (where socket dies), we should disconnect.
            this.disconnect();

            // Notify UI immediately as disconnect event might lag or be ambiguous
            if (!this.mainWindow.isDestroyed()) {
                this.mainWindow.send(CHANNELS.STUDENT_STATUS_UPDATE, 'kicked');
            }
        };

        // --- LAN Handlers ---
        this.socket.on(CHANNELS.LOCK_STUDENT, handleLock);
        this.socket.on(CHANNELS.UNLOCK_STUDENT, handleUnlock);
        this.socket.on(CHANNELS.KICK_STUDENT, handleKick);

        // --- Internet Handlers (Relay Wrapped) ---
        this.socket.on('relay_message', (msg: { event: string, data: any }) => {
            // Unwrap
            if (msg.event === CHANNELS.LOCK_STUDENT) handleLock(msg.data);
            if (msg.event === CHANNELS.UNLOCK_STUDENT) handleUnlock();
            if (msg.event === CHANNELS.KICK_STUDENT) handleKick();
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected:', reason);
            ipcMain.emit(CHANNELS.UNLOCK_STUDENT);

            if (reason === 'io server disconnect' || reason === 'transport close') {
                // If it was valid disconnect
            }

            if (this.wasKicked) {
                if (!this.mainWindow.isDestroyed()) {
                    this.mainWindow.send(CHANNELS.STUDENT_STATUS_UPDATE, 'kicked');
                }
            } else {
                if (!this.mainWindow.isDestroyed()) {
                    this.mainWindow.send(CHANNELS.STUDENT_STATUS_UPDATE, 'connection_lost');
                }
                // Only auto-restart discovery if we are in a state that warrants it?
                this.startDiscovery();
            }
        });
    }

    public disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    public stop() {
        this.stopDiscovery();
        this.disconnect();
    }
}
