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

    constructor(webContents: WebContents) {
        this.mainWindow = webContents;
    }

    public startDiscovery() {
        this.udpSocket = dgram.createSocket('udp4');

        this.udpSocket.on('message', (msg, rinfo) => {
            try {
                const packet = JSON.parse(msg.toString()) as BeaconPacket;
                if (packet.type === PacketType.BEACON) {
                    // Send found class to UI
                    this.mainWindow.send(CHANNELS.TEACHER_BEACON, packet);
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

    public stopDiscovery() {
        if (this.udpSocket) {
            this.udpSocket.close();
            this.udpSocket = null;
        }
    }

    public connectToClass(ip: string, port: number, info: { name: string; grade: string }) {
        if (this.socket) this.socket.disconnect();

        this.connectedClass = { ip, port };
        this.socket = io(`http://${ip}:${port}`);

        this.socket.on('connect', () => {
            console.log('Connected to teacher');
            this.wasKicked = false;
            this.socket?.emit(CHANNELS.SET_USER_INFO, info);
            this.stopDiscovery(); // Stop listening once connected
            this.mainWindow.send(CHANNELS.STUDENT_STATUS_UPDATE, 'connected');
        });

        this.socket.on(CHANNELS.LOCK_STUDENT, () => {
            ipcMain.emit(CHANNELS.LOCK_STUDENT); // Internal signal to LockManager
        });

        this.socket.on(CHANNELS.UNLOCK_STUDENT, () => {
            ipcMain.emit(CHANNELS.UNLOCK_STUDENT); // Internal signal to LockManager
        });

        this.socket.on(CHANNELS.KICK_STUDENT, () => {
            this.wasKicked = true;
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from teacher');
            ipcMain.emit(CHANNELS.UNLOCK_STUDENT); // Safety unlock

            if (this.wasKicked) {
                this.mainWindow.send(CHANNELS.STUDENT_STATUS_UPDATE, 'kicked');
            } else {
                this.mainWindow.send(CHANNELS.STUDENT_STATUS_UPDATE, 'disconnected');
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
