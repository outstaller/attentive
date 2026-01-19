import { BrowserWindow, globalShortcut, screen, app } from 'electron';
import { MAX_LOCK_TIME_MS } from '../shared/constants';
import path from 'path';

export class LockManager {
    private lockWindow: BrowserWindow | null = null;
    private isLocked: boolean = false;
    private unlockTimer: NodeJS.Timeout | null = null;

    constructor() {
        // Register fail-safe to unregister shortcuts on quit
        app.on('will-quit', () => {
            globalShortcut.unregisterAll();
        });
    }

    public lockScreen(timeoutMinutes?: number) {
        if (this.isLocked) return;
        this.isLocked = true;

        // 1. Create Lock Window if not exists
        this.createLockWindow(timeoutMinutes);

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
        if (!this.isLocked) return;
        this.isLocked = false;

        // 1. Destroy Lock Window
        if (this.lockWindow) {
            this.lockWindow.setClosable(true);
            this.lockWindow.close();
            this.lockWindow = null;
        }

        // 2. Unregister Shortcuts
        globalShortcut.unregisterAll();

        // 3. Clear Timer
        if (this.unlockTimer) {
            clearTimeout(this.unlockTimer);
            this.unlockTimer = null;
        }
    }

    private createLockWindow(timeoutMinutes?: number) {
        const displays = screen.getAllDisplays();
        // In a multi-monitor setup, we might need multiple windows. 
        // For now, let's cover the primary display or all if possible.
        // Electron Kiosk mode usually handles the main screen well.

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

        // We can load a simple data URL or a file
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
            .message { font-size: 5vw; margin-bottom: 20px; }
            .timer { font-size: 2vw; color: #ccc; }
          </style>
        </head>
        <body>
          <div class="message">👩‍🏫 עיניים אל המורה</div>
          <div class="timer" id="timer"></div>
          <script>
            let duration = ${durationMs};
            const endTime = Date.now() + duration;
            
            setInterval(() => {
                const now = Date.now();
                const diff = endTime - now;
                
                if (diff <= 0) {
                    document.getElementById('timer').innerText = "משוחרר...";
                } else {
                    const minutes = Math.floor(diff / 60000);
                    const seconds = Math.floor((diff % 60000) / 1000);
                    document.getElementById('timer').innerText = "שחרור אוטומטי בעוד: " + minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
                }
            }, 1000);
          </script>
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
            if (this.isLocked) e.preventDefault();
        });
    }

    private blockInputs() {
        // Block common escape keys
        // Note: Windows system keys (Ctrl+Alt+Del, Win+L) cannot be blocked by Electron without low-level hooks or DLLs.
        // But we can annoy the user or block Alt+Tab.

        globalShortcut.register('Alt+Tab', () => { return false; });
        globalShortcut.register('CommandOrControl+Tab', () => { return false; });
        globalShortcut.register('Alt+F4', () => { return false; });
        globalShortcut.register('F11', () => { return false; });
        globalShortcut.register('Escape', () => { return false; });
    }
}
