"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const network_teacher_1 = require("../services/network-teacher");
const network_student_1 = require("../services/network-student");
const lock_manager_1 = require("../services/lock-manager");
const constants_1 = require("../shared/constants");
const electron_store_1 = __importDefault(require("electron-store"));
const store = new electron_store_1.default();
let mainWindow = null;
let teacherService = null;
let studentService = null;
let lockManager = null;
const createWindow = () => {
    mainWindow = new electron_1.BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // Simplifying for this prototype
            // preload: path.join(__dirname, 'preload.js'),
        },
    });
    // Load the UI - in dev usage you might load localhost:3000, here we load index.html
    mainWindow.loadFile(path_1.default.join(__dirname, '../ui/index.html'));
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    // On Mac it's common to keep app running, but for this utility we can quit
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('will-quit', () => {
    if (teacherService)
        teacherService.stop();
    if (studentService) {
        studentService.stopDiscovery();
        studentService.disconnect();
    }
    // LockManager handles its own unregisterAll
});
// --- IPC Handlers ---
// Store Handlers
electron_1.ipcMain.handle(constants_1.CHANNELS.STORE_GET, (event, key) => {
    return store.get(key);
});
electron_1.ipcMain.on(constants_1.CHANNELS.STORE_SET, (event, key, val) => {
    store.set(key, val);
});
// Teacher Mode handlers
electron_1.ipcMain.on(constants_1.CHANNELS.START_TEACHER, (event, { name, className }) => {
    if (!mainWindow)
        return;
    teacherService = new network_teacher_1.TeacherNetworkService(mainWindow.webContents);
    teacherService.start(className, name);
    console.log(`Teacher Service Started for ${name} - ${className}`);
});
electron_1.ipcMain.on(constants_1.CHANNELS.LOCK_ALL, () => {
    teacherService === null || teacherService === void 0 ? void 0 : teacherService.lockAll();
});
electron_1.ipcMain.on(constants_1.CHANNELS.UNLOCK_ALL, () => {
    teacherService === null || teacherService === void 0 ? void 0 : teacherService.unlockAll();
});
electron_1.ipcMain.on(constants_1.CHANNELS.LOCK_STUDENT, (event, socketId) => {
    // Note: This channel is overloaded. 
    // If received with an arg, it's Teacher -> Server -> Lock specific student.
    // If received without arg (from StudentNetworkService), it's Client -> Lock Myself.
    if (socketId) {
        teacherService === null || teacherService === void 0 ? void 0 : teacherService.lockStudent(socketId);
    }
    else {
        // This is the student client signalling itself to lock
        if (!lockManager)
            lockManager = new lock_manager_1.LockManager();
        lockManager.lockScreen();
    }
});
// Student Mode handlers
electron_1.ipcMain.on(constants_1.CHANNELS.START_STUDENT, (event) => {
    if (!mainWindow)
        return;
    studentService = new network_student_1.StudentNetworkService(mainWindow.webContents);
    lockManager = new lock_manager_1.LockManager();
    studentService.startDiscovery();
    console.log('Student Service Started: Discovery Active');
});
electron_1.ipcMain.on(constants_1.CHANNELS.CONNECT_TO_CLASS, (event, { ip, port, studentInfo }) => {
    studentService === null || studentService === void 0 ? void 0 : studentService.connectToClass(ip, port, studentInfo);
});
// Internal IPC for Locking (triggered by Network Service)
// We already handled LOCK_STUDENT above for the "Client -> Lock Myself" case by checking args.
// But better to be explicit or use `ipcMain.emit` which is synchronous to internal listeners.
// However, `ipcMain.emit` triggers the same listeners as renderer `ipcRenderer.send`.
// So the handler above `ipcMain.on(CHANNELS.LOCK_STUDENT, ...)` handles both.
electron_1.ipcMain.on(constants_1.CHANNELS.UNLOCK_STUDENT, (event, socketId) => {
    if (socketId && teacherService) {
        teacherService.unlockStudent(socketId);
    }
    else {
        lockManager === null || lockManager === void 0 ? void 0 : lockManager.unlockScreen();
    }
});
//# sourceMappingURL=main.js.map