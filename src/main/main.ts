// ============================================================================
// Main Process Entry Point
// ============================================================================
// This file controls the app lifecycle, creates windows, and manages resources.
// It also coordinates the Auto-Update mechanism and Inter-Process Communication (IPC).

import { app, BrowserWindow, ipcMain, globalShortcut, dialog } from 'electron';
import path from 'path';
import * as fs from 'fs';
import { TeacherNetworkService } from '../services/network-teacher';
import { StudentNetworkService } from '../services/network-student';
import { LockManager } from '../services/lock-manager';
import { CHANNELS } from '../shared/constants';
import { BeaconPacket } from '../shared/types';
import { ConfigManager } from '../shared/config';
import Store from 'electron-store';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

// Configure Logging based on App Mode
// Parse update URL override from command line (e.g., --update-url http://localhost:5000)
const updateUrlArg = process.argv.find(arg => arg.startsWith('--update-url='));
const updateUrlOverride = updateUrlArg ? updateUrlArg.split('=')[1] : null;

const resourcesPath = process.resourcesPath;
const isStudent = fs.existsSync(path.join(resourcesPath, 'student.flag'));
const isTeacher = fs.existsSync(path.join(resourcesPath, 'teacher.flag'));
const isGpo = fs.existsSync(path.join(resourcesPath, 'gpo.flag'));

if (isStudent) {
    log.transports.file.fileName = 'student.log';
} else if (isTeacher) {
    log.transports.file.fileName = 'teacher.log';
}

// Initialize Logging
log.initialize();
Object.assign(console, log.functions);
log.info('Application Starting...');
if (isStudent) log.info('Mode: Student (Log: student.log)');
if (isTeacher) log.info('Mode: Teacher (Log: teacher.log)');

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
        // 1. Prevent closing if locked (Anti-Alt+F4 for Student)
        if (lockManager && lockManager.locked) {
            e.preventDefault();
            console.log('Blocked app closing attempt while locked.');
            return;
        }

        // 2. Graceful Shutdown for Teacher
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
    // --- Splash Window Setup ---
    let splashWindow: BrowserWindow | null = new BrowserWindow({
        width: 400,
        height: 300,
        transparent: false,
        frame: false,
        alwaysOnTop: true,
        resizable: false,
        center: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, '../ui/assets/icon.png'),
    });

    splashWindow.loadFile(path.join(__dirname, '../ui/splash.html'));

    // Helper to close splash and open main
    const launchApp = () => {
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
            splashWindow = null;
        }
        if (mainWindow === null) {
            createWindow();
        }
    };

    // --- Auto-Update Logic with Splash ---

    // 1. Update Not Available -> Launch App
    autoUpdater.on('update-not-available', () => {
        log.info('Update Check: No update available. Launching app...');
        setTimeout(launchApp, 1500); // 1.5s delay for user to see the splash "checking" state
    });

    // 2. Error -> Launch App (Fail-safe)
    autoUpdater.on('error', (err) => {
        // If it's the 404/latest.yml error (common in dev/no release), treat as no update
        if (err.message && (err.message.includes('404') || err.message.includes('latest.yml'))) {
            log.info('Update Check: No update available (404). Launching app...');
        } else {
            log.error('Update Check Error:', err);
        }
        setTimeout(launchApp, 1500);
    });

    // 3. Configure Auto-Download and URL Override
    autoUpdater.autoDownload = true;

    if (updateUrlOverride) {
        log.info('Overriding update URL:', updateUrlOverride);
        autoUpdater.setFeedURL({
            provider: 'generic',
            url: updateUrlOverride
        });
    }

    autoUpdater.on('checking-for-update', () => {
        log.info('Update Check: Checking...');
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.webContents.send('splash-status', 'בודק אם קיים עדכון...'); // "Checking for update..."
        }
    });

    autoUpdater.on('update-available', () => {
        log.info('Update found! Downloading...');
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.webContents.send('splash-status', 'נמצא עדכון גרסה. מוריד...'); // "Update found. Downloading..."
        }
    });

    // 4. Update Downloaded -> Show Button on Splash
    autoUpdater.on('update-downloaded', () => {
        log.info('Update downloaded. Prompting via Splash...');

        // If splash is open, show the button
        if (splashWindow && !splashWindow.isDestroyed()) {
            // Second arg 'true' enables the button in splash.html
            splashWindow.webContents.send('splash-status', 'גרסה חדשה מוכנה להתקנה.', true);
        } else {
            // Fallback: If splash was closed (unlikely but possible), relaunch it or use native dialog? 
            // Ideally we shouldn't have closed it.
            // For now, let's just reinstall the splash or use native dialog as fallback.
            dialog.showMessageBox({
                type: 'info',
                title: '\u202B' + 'עדכון גרסה' + '\u202C',
                message: '\u202B' + 'גרסה חדשה מוכנה. התקן?' + '\u202C',
                buttons: ['\u202B' + 'אישור' + '\u202C']
            }).then(() => {
                setImmediate(() => {
                    autoUpdater.quitAndInstall(true, true);
                });
            });
        }
    });

    // IPC handler for Splash Button
    ipcMain.on('install-update', () => {
        log.info('User confirmed update via Splash. Quitting and Installing...');
        autoUpdater.quitAndInstall(true, true);
    });

    // Trigger Check
    // Trigger Check
    if (!app.isPackaged) {
        log.info('Dev Mode: Skipping update check. Launching app...');
        setTimeout(launchApp, 500);
    } else if (isGpo && !updateUrlOverride) {
        log.info('GPO Mode: Auto-update disabled. Launching app...');
        setTimeout(launchApp, 500);
    } else {
        autoUpdater.checkForUpdates().catch((e) => {
            log.warn('Initial update check failed to start:', e.message);
            launchApp();
        });
    }

    // Fallback Polling (if app stays open long enough) - skip for GPO
    if (!isGpo) {
        setInterval(() => {
            autoUpdater.checkForUpdatesAndNotify().catch((e) => {
                log.warn('Scheduled update check failed:', e.message);
            });
        }, 60 * 60 * 1000);
    }

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
// Check for enforced mode via flag files (set by installer) in resources directory
// fs and resourcesPath are defined at top/module level now

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

ipcMain.handle(CHANNELS.GET_CONFIG, () => {
    return ConfigManager.getInstance().getConfig();
});

ipcMain.handle(CHANNELS.GET_APP_VERSION, () => {
    return app.getVersion();
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
