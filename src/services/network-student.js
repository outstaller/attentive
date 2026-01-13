"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentNetworkService = void 0;
const dgram_1 = __importDefault(require("dgram"));
const socket_io_client_1 = require("socket.io-client");
const electron_1 = require("electron");
const constants_1 = require("../shared/constants");
const types_1 = require("../shared/types");
class StudentNetworkService {
    constructor(webContents) {
        this.udpSocket = null;
        this.socket = null;
        this.connectedClass = null;
        this.mainWindow = webContents;
    }
    startDiscovery() {
        this.udpSocket = dgram_1.default.createSocket('udp4');
        this.udpSocket.on('message', (msg, rinfo) => {
            try {
                const packet = JSON.parse(msg.toString());
                if (packet.type === types_1.PacketType.BEACON) {
                    // Send found class to UI
                    this.mainWindow.send(constants_1.CHANNELS.TEACHER_BEACON, packet);
                }
            }
            catch (e) {
                // Ignore invalid packets
            }
        });
        this.udpSocket.bind(constants_1.UDP_PORT, () => {
            var _a;
            console.log('Student listening for beacons on port', constants_1.UDP_PORT);
            (_a = this.udpSocket) === null || _a === void 0 ? void 0 : _a.setBroadcast(true);
        });
    }
    stopDiscovery() {
        if (this.udpSocket) {
            this.udpSocket.close();
            this.udpSocket = null;
        }
    }
    connectToClass(ip, port, info) {
        if (this.socket)
            this.socket.disconnect();
        this.connectedClass = { ip, port };
        this.socket = (0, socket_io_client_1.io)(`http://${ip}:${port}`);
        this.socket.on('connect', () => {
            var _a;
            console.log('Connected to teacher');
            (_a = this.socket) === null || _a === void 0 ? void 0 : _a.emit(constants_1.CHANNELS.SET_USER_INFO, info);
            this.stopDiscovery(); // Stop listening once connected
            this.mainWindow.send(constants_1.CHANNELS.STUDENT_STATUS_UPDATE, 'connected');
        });
        this.socket.on(constants_1.CHANNELS.LOCK_STUDENT, () => {
            electron_1.ipcMain.emit(constants_1.CHANNELS.LOCK_STUDENT); // Internal signal to LockManager
        });
        this.socket.on(constants_1.CHANNELS.UNLOCK_STUDENT, () => {
            electron_1.ipcMain.emit(constants_1.CHANNELS.UNLOCK_STUDENT); // Internal signal to LockManager
        });
        this.socket.on('disconnect', () => {
            console.log('Disconnected from teacher');
            electron_1.ipcMain.emit(constants_1.CHANNELS.UNLOCK_STUDENT); // Safety unlock
            this.mainWindow.send(constants_1.CHANNELS.STUDENT_STATUS_UPDATE, 'disconnected');
            this.startDiscovery(); // Resume searching
        });
    }
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}
exports.StudentNetworkService = StudentNetworkService;
//# sourceMappingURL=network-student.js.map