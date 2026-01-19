import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import path from 'path';
import { TeacherNetworkService } from '../services/network-teacher';
import { StudentNetworkService } from '../services/network-student';
import { LockManager } from '../services/lock-manager';
import { CHANNELS } from '../shared/constants';
import { BeaconPacket } from '../shared/types';
import Store from 'electron-store';

const store = new Store();

let mainWindow: BrowserWindow | null = null;
let teacherService: TeacherNetworkService | null = null;
let studentService: StudentNetworkService | null = null;
let lockManager: LockManager | null = null;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // Simplifying for this prototype
            // preload: path.join(__dirname, 'preload.js'),
        },
        autoHideMenuBar: true,
        icon: path.join(__dirname, '../ui/assets/icon.png'),
    });

    // Load the UI - in dev usage you might load localhost:3000, here we load index.html
    mainWindow.loadFile(path.join(__dirname, '../ui/index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    // On Mac it's common to keep app running, but for this utility we can quit
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    if (teacherService) teacherService.stop();
    if (studentService) {
        studentService.stopDiscovery();
        studentService.disconnect();
    }
    // LockManager handles its own unregisterAll
});

// --- IPC Handlers ---

// Check for enforced mode via flag files in resources directory
const fs = require('fs');
const resourcesPath = process.resourcesPath;

let enforcedMode: 'teacher' | 'student' | null = null;
if (fs.existsSync(path.join(resourcesPath, 'teacher.flag'))) {
    enforcedMode = 'teacher';
} else if (fs.existsSync(path.join(resourcesPath, 'student.flag'))) {
    enforcedMode = 'student';
}

ipcMain.handle(CHANNELS.APP_MODE, () => {
    return enforcedMode;
});

// Store Handlers
ipcMain.handle(CHANNELS.STORE_GET, (event, key) => {
    return store.get(key);
});

ipcMain.on(CHANNELS.STORE_SET, (event, key, val) => {
    store.set(key, val);
});

// Teacher Mode handlers
ipcMain.on(CHANNELS.START_TEACHER, (event, { name, className, password, lockTimeout }) => {
    if (!mainWindow) return;
    if (studentService) {
        studentService.stop();
        studentService = null;
    }
    if (teacherService) {
        teacherService.stop();
    }
    teacherService = new TeacherNetworkService(mainWindow.webContents);
    teacherService.start(className, name, password, lockTimeout);
    console.log(`Teacher Service Started for ${name} - ${className}`);
});

ipcMain.on(CHANNELS.STOP_TEACHER, () => {
    if (teacherService) {
        teacherService.kickAll(); // Disconnect everyone cleanly first
        setTimeout(() => { // Give a moment for kick packets to send? Or just stop.
            teacherService?.stop();
            teacherService = null;
        }, 100);
    }
});

ipcMain.on(CHANNELS.LOCK_ALL, () => {
    teacherService?.lockAll();
});

ipcMain.on(CHANNELS.UNLOCK_ALL, () => {
    teacherService?.unlockAll();
});

ipcMain.on(CHANNELS.LOCK_STUDENT, (event, socketId: string) => {
    // Note: This channel is overloaded. 
    // If received with an arg, it's Teacher -> Server -> Lock specific student.
    // If received without arg (from StudentNetworkService), it's Client -> Lock Myself.
    if (socketId) {
        teacherService?.lockStudent(socketId);
    } else {
        // This is the student client signalling itself to lock
        if (!lockManager) lockManager = new LockManager();
        lockManager.lockScreen();
    }
});

// Student Mode handlers
ipcMain.on(CHANNELS.START_STUDENT, (event) => {
    if (!mainWindow) return;
    if (teacherService) {
        teacherService.stop();
        teacherService = null;
    }
    if (studentService) {
        studentService.stop();
    }
    studentService = new StudentNetworkService(mainWindow.webContents);
    lockManager = new LockManager();

    studentService.startDiscovery();
    console.log('Student Service Started: Discovery Active');
});

ipcMain.on(CHANNELS.CONNECT_TO_CLASS, (event, { ip, port, studentInfo, password }) => {
    if (!studentService) {
        console.error('Error: studentService is null!');
        return;
    }
    studentService.updateWebContents(event.sender);
    studentService.connectToClass(ip, port, studentInfo, password);
});

// Internal IPC for Locking (triggered by Network Service)
// We already handled LOCK_STUDENT above for the "Client -> Lock Myself" case by checking args.
// But better to be explicit or use `ipcMain.emit` which is synchronous to internal listeners.
// However, `ipcMain.emit` triggers the same listeners as renderer `ipcRenderer.send`.
// So the handler above `ipcMain.on(CHANNELS.LOCK_STUDENT, ...)` handles both.

ipcMain.on(CHANNELS.UNLOCK_STUDENT, (event, socketId: string) => {
    if (socketId && teacherService) {
        teacherService.unlockStudent(socketId);
    } else {
        lockManager?.unlockScreen();
    }
});

// Kick Handlers
ipcMain.on(CHANNELS.KICK_STUDENT, (event, socketId: string) => {
    teacherService?.kickStudent(socketId);
});

ipcMain.on(CHANNELS.KICK_ALL, () => {
    teacherService?.kickAll();
});
