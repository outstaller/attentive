"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LockManager = void 0;
const electron_1 = require("electron");
const constants_1 = require("../shared/constants");
class LockManager {
    constructor() {
        this.lockWindow = null;
        this.isLocked = false;
        this.unlockTimer = null;
        // Register fail-safe to unregister shortcuts on quit
        electron_1.app.on('will-quit', () => {
            electron_1.globalShortcut.unregisterAll();
        });
    }
    lockScreen() {
        if (this.isLocked)
            return;
        this.isLocked = true;
        // 1. Create Lock Window if not exists
        this.createLockWindow();
        // 2. Register Shortcuts to block
        this.blockInputs();
        // 3. Start Dead Man's Switch
        this.unlockTimer = setTimeout(() => {
            console.log('Dead man switch triggered: Force unlocking');
            this.unlockScreen();
        }, constants_1.MAX_LOCK_TIME_MS);
    }
    unlockScreen() {
        if (!this.isLocked)
            return;
        this.isLocked = false;
        // 1. Destroy Lock Window
        if (this.lockWindow) {
            this.lockWindow.close();
            this.lockWindow = null;
        }
        // 2. Unregister Shortcuts
        electron_1.globalShortcut.unregisterAll();
        // 3. Clear Timer
        if (this.unlockTimer) {
            clearTimeout(this.unlockTimer);
            this.unlockTimer = null;
        }
    }
    createLockWindow() {
        const displays = electron_1.screen.getAllDisplays();
        // In a multi-monitor setup, we might need multiple windows. 
        // For now, let's cover the primary display or all if possible.
        // Electron Kiosk mode usually handles the main screen well.
        this.lockWindow = new electron_1.BrowserWindow({
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
        // We can load a simple data URL or a file
        const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl">
        <head>
          <style>
            body { 
              background-color: #000; 
              color: white; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0; 
              font-family: 'Segoe UI', sans-serif;
              font-size: 5vw;
            }
          </style>
        </head>
        <body>
          <div>👮 עיניים אל המורה</div>
        </body>
      </html>
    `;
        this.lockWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
        this.lockWindow.on('closed', () => {
            this.lockWindow = null;
        });
        // Prevent closing via Alt+F4 is handled by 'closable: false' and 'kiosk', 
        // but proactive event killing is good practice in C#/Win32, less so in Electron js unless we intercept the close event.
        this.lockWindow.on('close', (e) => {
            if (this.isLocked)
                e.preventDefault();
        });
    }
    blockInputs() {
        // Block common escape keys
        // Note: Windows system keys (Ctrl+Alt+Del, Win+L) cannot be blocked by Electron without low-level hooks or DLLs.
        // But we can annoy the user or block Alt+Tab.
        electron_1.globalShortcut.register('Alt+Tab', () => { return false; });
        electron_1.globalShortcut.register('CommandOrControl+Tab', () => { return false; });
        electron_1.globalShortcut.register('Alt+F4', () => { return false; });
        electron_1.globalShortcut.register('F11', () => { return false; });
        electron_1.globalShortcut.register('Escape', () => { return false; });
    }
}
exports.LockManager = LockManager;
//# sourceMappingURL=lock-manager.js.map