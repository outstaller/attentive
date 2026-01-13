"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherNetworkService = void 0;
const dgram_1 = __importDefault(require("dgram"));
const socket_io_1 = require("socket.io");
const http_1 = __importDefault(require("http"));
const constants_1 = require("../shared/constants");
const types_1 = require("../shared/types");
const ip = __importStar(require("ip"));
class TeacherNetworkService {
    constructor(webContents) {
        this.udpSocket = null;
        this.io = null;
        this.httpServer = null;
        this.beaconTimer = null;
        this.students = new Map(); // socketId -> Student
        this.mainWindow = webContents;
    }
    start(className, teacherName) {
        return __awaiter(this, void 0, void 0, function* () {
            this.startUDPServer(className, teacherName);
            this.startSocketServer();
        });
    }
    stop() {
        if (this.beaconTimer)
            clearInterval(this.beaconTimer);
        if (this.udpSocket)
            this.udpSocket.close();
        if (this.io)
            this.io.close();
        if (this.httpServer)
            this.httpServer.close();
        this.students.clear();
    }
    startUDPServer(className, teacherName) {
        this.udpSocket = dgram_1.default.createSocket('udp4');
        // Allow broadcast
        this.udpSocket.bind(() => {
            var _a;
            (_a = this.udpSocket) === null || _a === void 0 ? void 0 : _a.setBroadcast(true);
            console.log('UDP Beacon started');
        });
        const localIp = ip.address();
        const packet = {
            type: types_1.PacketType.BEACON,
            teacher: teacherName,
            class: className,
            ip: localIp,
            port: constants_1.TCP_PORT,
        };
        const message = Buffer.from(JSON.stringify(packet));
        this.beaconTimer = setInterval(() => {
            var _a;
            (_a = this.udpSocket) === null || _a === void 0 ? void 0 : _a.send(message, constants_1.UDP_PORT, '255.255.255.255', (err) => {
                if (err)
                    console.error('Error sending beacon:', err);
            });
        }, 2000);
    }
    startSocketServer() {
        this.httpServer = http_1.default.createServer();
        this.io = new socket_io_1.Server(this.httpServer, {
            cors: { origin: '*' }
        });
        this.io.on('connection', (socket) => {
            console.log('Student connected:', socket.id);
            socket.on(constants_1.CHANNELS.SET_USER_INFO, (info) => {
                const student = {
                    id: socket.id,
                    name: info.name,
                    grade: info.grade,
                    ip: socket.handshake.address,
                    status: 'active',
                    lastSeen: Date.now(),
                };
                this.students.set(socket.id, student);
                this.broadcastStudentList();
            });
            socket.on('disconnect', () => {
                this.students.delete(socket.id);
                this.broadcastStudentList();
            });
        });
        this.httpServer.listen(constants_1.TCP_PORT, () => {
            console.log(`Socket.io Server running on port ${constants_1.TCP_PORT}`);
        });
    }
    lockAll() {
        var _a;
        (_a = this.io) === null || _a === void 0 ? void 0 : _a.emit(constants_1.CHANNELS.LOCK_STUDENT);
        this.updateAllStatuses('locked');
    }
    unlockAll() {
        var _a;
        (_a = this.io) === null || _a === void 0 ? void 0 : _a.emit(constants_1.CHANNELS.UNLOCK_STUDENT);
        this.updateAllStatuses('active');
    }
    lockStudent(socketId) {
        var _a;
        (_a = this.io) === null || _a === void 0 ? void 0 : _a.to(socketId).emit(constants_1.CHANNELS.LOCK_STUDENT);
        this.updateStudentStatus(socketId, 'locked');
    }
    unlockStudent(socketId) {
        var _a;
        (_a = this.io) === null || _a === void 0 ? void 0 : _a.to(socketId).emit(constants_1.CHANNELS.UNLOCK_STUDENT);
        this.updateStudentStatus(socketId, 'active');
    }
    updateAllStatuses(status) {
        this.students.forEach(s => s.status = status);
        this.broadcastStudentList();
    }
    updateStudentStatus(id, status) {
        const s = this.students.get(id);
        if (s) {
            s.status = status;
            this.broadcastStudentList();
        }
    }
    broadcastStudentList() {
        this.mainWindow.send(constants_1.CHANNELS.GET_STUDENTS, Array.from(this.students.values()));
    }
}
exports.TeacherNetworkService = TeacherNetworkService;
//# sourceMappingURL=network-teacher.js.map