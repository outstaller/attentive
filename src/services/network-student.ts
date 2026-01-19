// ============================================================================
// Student Network Service
// ============================================================================
// Handles the client-side logic for the Student mode:
// 1. Listens for UDP beacons to find classes.
// 2. Connects to the Teacher via Socket.io.
// 3. Handles Lock/Unlock signals and manages the local auto-unlock timer.

import dgram from 'dgram';
import { io, Socket } from 'socket.io-client';
import { ipcMain, WebContents } from 'electron';
import { UDP_PORT, CHANNELS } from '../shared/constants';
import { PacketType, BeaconPacket } from '../shared/types';

export class StudentNetworkService {
    private udpSocket: dgram.Socket | null = null;
    private socket: Socket | null = null;
    private mainWindow: WebContents;
    private connectedClass: { ip: string; port: number } | null = null;
    private wasKicked: boolean = false;
    // Timer to auto-unlock if the teacher disappears or app crashes
    private unlockTimer: NodeJS.Timeout | null = null;

    constructor(webContents: WebContents) {
        this.mainWindow = webContents;
    }

    public updateWebContents(webContents: WebContents) {
        this.mainWindow = webContents;
    }

    /**
     * Starts listening for UDP broadcasts from teachers.
     * Packets found are sent to the UI.
     */
    public startDiscovery() {
        this.udpSocket = dgram.createSocket('udp4');
        // ... (omitting unchanged discovery logic) ...


        this.udpSocket.on('message', (msg, rinfo) => {
            try {
                const packet = JSON.parse(msg.toString()) as BeaconPacket;
                if (packet.type === PacketType.BEACON) {
                    // Always prefer the actual Sender IP (rinfo.address) over the claimed IP in the packet
                    // This solves issues where multi-homed teachers broadcast unreachable IPs via reachable interfaces
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

    /**
     * Stops listening for UDP broadcasts.
     */
    public stopDiscovery() {
        if (this.udpSocket) {
            this.udpSocket.close();
            this.udpSocket = null;
        }
    }

    /**
     * Connects to a selected class via Socket.IO.
     * Handles authentication and sets up lock listeners.
     */
    public connectToClass(ip: string, port: number, info: { name: string; grade: string }, password?: string, teacherInfo?: { teacherName: string; className: string }) {
        if (this.socket) this.socket.disconnect();

        this.connectedClass = { ip, port };
        this.socket = io(`http://${ip}:${port}`, {
            auth: { password },
            transports: ['websocket'],
            reconnectionAttempts: 3,
            forceNew: true
        });

        this.socket.on('connect_error', (err) => {
            console.error('Socket connect_error:', err.message);
            if (!this.mainWindow.isDestroyed()) {
                this.mainWindow.send(CHANNELS.STUDENT_STATUS_UPDATE, 'error', err.message);
            }
        });

        this.socket.on('connect', () => {
            console.log('Socket connected! ID:', this.socket?.id);
            if (!this.mainWindow.isDestroyed()) {
                this.mainWindow.send(CHANNELS.STUDENT_STATUS_UPDATE, 'connected');
            }
            this.wasKicked = false;
            this.socket?.emit(CHANNELS.SET_USER_INFO, info);
            this.stopDiscovery(); // Stop listening once connected
        });

        // --- Handle Lock Signal ---
        this.socket.on(CHANNELS.LOCK_STUDENT, (data?: { timeout?: number }) => {
            // Internal signal to LockManager - PASS THE DATA
            // Augment data with teacher info for display
            const lockData = {
                ...data,
                teacherName: teacherInfo?.teacherName,
                className: teacherInfo?.className
            };
            ipcMain.emit(CHANNELS.LOCK_STUDENT, undefined, lockData);

            // Set local auto-unlock timer
            if (this.unlockTimer) clearTimeout(this.unlockTimer);

            if (data?.timeout) {
                console.log(`Student locked. Auto-unlock in ${data.timeout} minutes.`);
                this.unlockTimer = setTimeout(() => {
                    console.log('Auto-unlock timer fired.');
                    ipcMain.emit(CHANNELS.UNLOCK_STUDENT);
                    this.unlockTimer = null;
                }, data.timeout * 60 * 1000);
            }
        });

        // --- Handle Unlock Signal ---
        this.socket.on(CHANNELS.UNLOCK_STUDENT, () => {
            console.log('Received UNLOCK_STUDENT from teacher');
            if (this.unlockTimer) {
                clearTimeout(this.unlockTimer);
                this.unlockTimer = null;
            }
            ipcMain.emit(CHANNELS.UNLOCK_STUDENT, undefined); // Internal signal to LockManager
        });

        this.socket.on(CHANNELS.KICK_STUDENT, () => {
            this.wasKicked = true;
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected from teacher:', reason);
            ipcMain.emit(CHANNELS.UNLOCK_STUDENT); // Safety unlock

            // Prevent auto-reconnection attempts since we want to return to discovery
            // This stops the 'connect_error' loop when teacher closes app
            if (reason === 'io server disconnect' || reason === 'transport close') {
                this.socket?.disconnect();
            }

            if (this.wasKicked) {
                if (!this.mainWindow.isDestroyed()) {
                    this.mainWindow.send(CHANNELS.STUDENT_STATUS_UPDATE, 'kicked');
                }
            } else {
                if (!this.mainWindow.isDestroyed()) {
                    // Send 'connection_lost' so UI can decide whether to show a message or just reset
                    this.mainWindow.send(CHANNELS.STUDENT_STATUS_UPDATE, 'connection_lost');
                }
                this.startDiscovery(); // Resume searching
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
