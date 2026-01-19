// ============================================================================
// Lock Manager (Kiosk Mode)
// ============================================================================
// Controls the physical locking of the student's screen.
// 1. Spawns a full-screen, always-on-top Kiosk window.
// 2. Registers global shortcuts to block inputs (Alt+Tab, etc.).
// 3. Implements a Dead Man's Switch (auto-unlock) as a fail-safe.

import { BrowserWindow, globalShortcut, screen, ipcMain } from 'electron';
import path from 'path';
import { CHANNELS, MAX_LOCK_TIME_MS } from '../shared/constants';

export class LockManager {
    private lockWindow: BrowserWindow | null = null;
    private isLocked: boolean = false;
    private unlockTimer: NodeJS.Timeout | null = null;

    constructor() {
        // Prepare resources if needed
    }

    /**
     * Locks the screen by creating a covering window and blocking shortcuts.
     * @param timeoutMinutes Optional dynamic timeout from the teacher.
     */
    public lockScreen(timeoutMinutes?: number, teacherName?: string, className?: string) {
        if (this.isLocked) return;
        this.isLocked = true;

        // 1. Create Lock Window if not exists
        this.createLockWindow(timeoutMinutes, teacherName, className);

        // 2. Register Shortcuts to block
        this.blockInputs();

        // 3. Start Dead Man's Switch
        const timeoutMs = timeoutMinutes ? (timeoutMinutes * 60 * 1000) : MAX_LOCK_TIME_MS;
        this.unlockTimer = setTimeout(() => {
            console.log('Dead man switch triggered: Force unlocking');
            this.unlockScreen();
        }, timeoutMs);
    }

    public unlockScreen() {
        console.log('LockManager.unlockScreen called. isLocked:', this.isLocked);
        if (!this.isLocked) return;
        this.isLocked = false;

        // 1. Close Window
        if (this.lockWindow && !this.lockWindow.isDestroyed()) {
            console.log('Closing lock window');
            this.lockWindow.close();
        } else {
            console.log('Lock window is null or destroyed');
        }
        this.lockWindow = null;

        // 2. Unblock Inputs
        this.unblockInputs();

        // 3. Clear Timer
        if (this.unlockTimer) {
            clearTimeout(this.unlockTimer);
            this.unlockTimer = null;
        }
    }

    /**
     * Registers global shortcuts to consume standard user escape keys.
     * Note: OS-level keys like Ctrl+Alt+Del cannot be blocked by Electron.
     */
    private blockInputs() {
        // Prevent Alt+Tab, Alt+F4, Windows Key, etc.
        // This is "best effort" on Windows.
        const shortcutsToBlock = [
            'Alt+Tab',
            'Alt+F4',
            'CommandOrControl+Escape',
            'Alt+Space',
            'F11',
            'Control+Shift+Escape', // Task Manager (often blocked by OS, but worth trying)
        ];

        shortcutsToBlock.forEach(shortcut => {
            try {
                if (!globalShortcut.isRegistered(shortcut)) {
                    globalShortcut.register(shortcut, () => {
                        console.log(`Blocked shortcut: ${shortcut}`);
                        // Focus lock window aggressively
                        if (this.lockWindow && !this.lockWindow.isDestroyed()) {
                            this.lockWindow.show();
                            this.lockWindow.focus();
                            this.lockWindow.setAlwaysOnTop(true, 'screen-saver');
                        }
                    });
                }
            } catch (e) {
                console.warn(`Failed to block ${shortcut}`, e);
            }
        });
    }

    private unblockInputs() {
        globalShortcut.unregisterAll();
    }
    /**
     * Creates the overlay window that physically blocks the screen.
     */
    private createLockWindow(timeoutMinutes?: number, teacherName?: string, className?: string) {
        const displays = screen.getAllDisplays();
        // In a multi-monitor setup, we currently cover the primary display.
        // Electron Kiosk mode usually handles the main screen.

        this.lockWindow = new BrowserWindow({
            fullscreen: true,
            kiosk: true,
            alwaysOnTop: true,
            closable: false,
            frame: false,
            skipTaskbar: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false // For simple locking HTML
            }
        });

        const safeTeacher = teacherName || '';
        const safeClass = className || '';

        // We use a generated HTML string to render the lock screen
        // This avoids needing a separate HTML file for the lock view.
        const durationMs = timeoutMinutes ? (timeoutMinutes * 60 * 1000) : MAX_LOCK_TIME_MS;
        const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl">
        <head>
          <style>
            body { 
              background-color: #000; 
              color: white; 
              display: flex; 
              flex-direction: column;
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0; 
              font-family: 'Segoe UI', sans-serif;
            }
            .message { font-size: 5vw; margin-bottom: 20px; font-weight: bold; }
            .details { font-size: 2.5vw; margin-bottom: 40px; color: #aaa; text-align: center; }
            .timer { font-size: 2vw; color: #555; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="message">👩‍🏫 עיניים אל המורה</div>
          ${safeTeacher ? `<div class="details">${safeTeacher} ${safeClass ? ' • ' + safeClass : ''}</div>` : ''}
          <div class="timer" id="timer"></div>
          <script>
            const { ipcRenderer } = require('electron');
            let duration = ${durationMs};
            const endTime = Date.now() + duration;
            
            setInterval(() => {
              const remaining = endTime - Date.now();
              if (remaining <= 0) {
                 document.getElementById('timer').innerText = "משחרר...";
                 // Force unlock from client side
                 ipcRenderer.send('${CHANNELS.UNLOCK_STUDENT}');
              } else {
                 const minutes = Math.floor(remaining / 60000);
                 const seconds = Math.floor((remaining % 60000) / 1000);
                 document.getElementById('timer').innerText = 
                    minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
              }
            }, 1000);
          </script>
        </body>
      </html>
    `;

        this.lockWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

        // Prevent closing via Alt+F4 is handled by 'closable: false' and 'kiosk', 
        // but proactive event killing is good practice in C#/Win32, less so in Electron js unless we intercept the close event.
        this.lockWindow.on('close', (e) => {
            if (this.isLocked) e.preventDefault();
        });
    }

}
