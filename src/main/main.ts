// ============================================================================
// Main Process Entry Point
// ============================================================================
// This file controls the app lifecycle, creates windows, and manages resources.
// It also coordinates the Auto-Update mechanism and Inter-Process Communication (IPC).

import { app, BrowserWindow, ipcMain, globalShortcut, dialog } from 'electron';
import path from 'path';
import { TeacherNetworkService } from '../services/network-teacher';
import { StudentNetworkService } from '../services/network-student';
import { LockManager } from '../services/lock-manager';
import { CHANNELS } from '../shared/constants';
import { BeaconPacket } from '../shared/types';
import Store from 'electron-store';
import { autoUpdater } from 'electron-updater';

// Persistent store for user preferences (name, class name, etc.)
const store = new Store();

let mainWindow: BrowserWindow | null = null;
let teacherService: TeacherNetworkService | null = null;
let studentService: StudentNetworkService | null = null;
let lockManager: LockManager | null = null;

/**
 * Creates the main application window.
 * The UI is loaded from index.html (React).
 */
const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            nodeIntegration: true, // Enabled for this prototype to allow direct IPC access
            contextIsolation: false, // Simplifying for this prototype
            // preload: path.join(__dirname, 'preload.js'),
        },
        autoHideMenuBar: true,
        icon: path.join(__dirname, '../ui/assets/icon.png'),
    });

    // Load the React application
    mainWindow.loadFile(path.join(__dirname, '../ui/index.html'));

    mainWindow.on('close', (e) => {
        if (teacherService) {
            e.preventDefault(); // Stop close
            console.log('Graceful shutdown initiated...');
            teacherService.shutdown().finally(() => {
                teacherService = null; // Prevent infinite loop
                mainWindow?.close(); // Re-trigger close
            });
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

// ============================================================================
// App Lifecycle & Auto-Updater
// ============================================================================

app.whenReady().then(() => {
    createWindow();

    // --- Auto-Update Configuration ---
    // The feed URL is configured in electron-builder.json (generic provider).
    // This logic checks for updates immediately on startup and then every hour.

    // Check immediately
    autoUpdater.checkForUpdatesAndNotify();

    // Poll every hour
    setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, 60 * 60 * 1000);

    // Notify user when an update is fully downloaded and ready to install
    autoUpdater.on('update-downloaded', () => {
        dialog.showMessageBox({
            type: 'info',
            title: 'Update Ready',
            message: 'A new version has been downloaded. Restart now to install?',
            buttons: ['Restart', 'Later']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    // On Mac it's common to keep app running, but for this utility we can quit
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    // Cleanup services on exit
    if (teacherService) teacherService.stop();
    if (studentService) {
        studentService.stopDiscovery();
        studentService.disconnect();
    }
    // LockManager handles its own unregisterAll
});

// ============================================================================
// IPC Handlers - Communication between UI and Back-end
// ============================================================================

// Check for enforced mode via flag files (set by installer) in resources directory
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

// Store Handlers (Get/Set settings)
ipcMain.handle(CHANNELS.STORE_GET, (event, key) => {
    return store.get(key);
});

ipcMain.on(CHANNELS.STORE_SET, (event, key, val) => {
    store.set(key, val);
});

// --- Teacher Mode Handlers ---
ipcMain.handle(CHANNELS.START_TEACHER, async (event, { name, className, password, lockTimeout }) => {
    if (!mainWindow) return { success: false, error: 'Internal Error' };

    // Cleanup any existing services to ensure clean state
    if (studentService) {
        studentService.stop();
        studentService = null;
    }
    if (teacherService) {
        teacherService.stop();
    }

    // Initialize Teacher Service
    teacherService = new TeacherNetworkService(mainWindow.webContents);

    try {
        await teacherService.start(className, name, password, lockTimeout);
        console.log(`Teacher Service Started for ${name} - ${className}`);
        return { success: true };
    } catch (err: any) {
        console.error('Failed to start teacher service:', err);
        return { success: false, error: err.message || 'Connection Failed' };
    }
});

ipcMain.on(CHANNELS.STOP_TEACHER, () => {
    if (teacherService) {
        teacherService.kickAll(); // Gracefully disconnect students
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

ipcMain.on(CHANNELS.LOCK_STUDENT, (event, arg: string | { timeout?: number, teacherName?: string, className?: string }) => {
    // Note: This channel is overloaded to handle both Teacher->Student and Student->Self scenarios.
    // If received with a string arg, it's Teacher -> Server -> Lock specific student.
    // If received with object/no arg (from StudentNetworkService), it's Client -> Lock Myself.

    // Case 1: String arg = Teacher locking a specific student by Socket ID
    if (typeof arg === 'string') {
        teacherService?.lockStudent(arg);
    }
    // Case 2: Object/Undefined arg = Student client requesting to lock itself (LockManager)
    else {
        // This is the student client signalling itself to lock
        const timeout = (typeof arg === 'object' && arg?.timeout) ? arg.timeout : undefined;
        const teacherName = (typeof arg === 'object' && arg?.teacherName) ? arg.teacherName : undefined;
        const className = (typeof arg === 'object' && arg?.className) ? arg.className : undefined;

        if (!lockManager) lockManager = new LockManager();
        lockManager.lockScreen(timeout, teacherName, className);
    }
});

// --- Student Mode Handlers ---
ipcMain.on(CHANNELS.START_STUDENT, (event) => {
    if (!mainWindow) return;

    // Cleanup
    if (teacherService) {
        teacherService.stop();
        teacherService = null;
    }
    if (studentService) {
        studentService.stop();
    }

    // Initialize Student Service
    studentService = new StudentNetworkService(mainWindow.webContents);
    lockManager = new LockManager();

    studentService.startDiscovery();
    console.log('Student Service Started: Discovery Active');
});

ipcMain.on(CHANNELS.CONNECT_TO_CLASS, (event, { ip, port, studentInfo, password, teacherName, className, relayId }) => {
    if (!studentService) {
        console.error('Error: studentService is null!');
        return;
    }
    studentService.updateWebContents(event.sender);
    // relayId is passed inside the teacherInfo object (last arg)
    studentService.connectToClass(ip, port, studentInfo, password, { teacherName, className, relayId });
});

// Internal IPC for Locking (triggered by Network Service)
// We already handled LOCK_STUDENT above for the "Client -> Lock Myself" case by checking args.
// But better to be explicit or use `ipcMain.emit` which is synchronous to internal listeners.
// However, `ipcMain.emit` triggers the same listeners as renderer `ipcRenderer.send`.
// So the handler above `ipcMain.on(CHANNELS.LOCK_STUDENT, ...)` handles both.

ipcMain.on(CHANNELS.UNLOCK_STUDENT, (event, socketId: string) => {
    console.log('Main Process: UNLOCK_STUDENT received. socketId:', socketId, 'teacherService:', !!teacherService, 'lockManager:', !!lockManager);

    // Overloaded Channel:
    // If socketId is present + Teacher Service exists -> Teacher unlocking a specific student.
    if (socketId && teacherService) {
        console.log('Unlocking via Teacher Service');
        teacherService.unlockStudent(socketId);
    }
    // Otherwise -> Student client unlocking itself (LockManager).
    else {
        console.log('Unlocking via local LockManager');
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
