# Attentive CMS - מערכת ניהול כיתה

Attentive is a dual-mode **Classroom Management System** built with Electron, React, and Node.js. It operates entirely over the local network (LAN) without requiring external servers.

## ✨ Features

### 👨‍🏫 Teacher Mode (Host)
- **Classroom Setup**: Easy setup for teacher name and class name.
- **Student Discovery**: Automatically detects students on the local Wi-Fi.
- **Dashboard**: Real-time grid view of connected students.
- **Controls**:
  - 🔴 **Lock All**: Instantly lock all student screens.
  - 🟢 **Unlock All**: Release control of all screens.
  - ❌ **Disconnect All**: Disconnect all students and reset their connection.
  - 🔓 **Individual Control**: Lock/Unlock/Disconnect specific students.

### 👨‍🎓 Student Mode (Client)
- **Auto-Discovery**: Listens for teacher beacons via UDP to find available classes.
- **One-Click Connect**: Simple connection process requiring only name and grade.
- **Kiosk Lock**:
  - When locked, a full-screen "Eyes on Teacher" window appears.
  - Blocks `Alt+Tab`, `Esc`, `F11`, and other common shortcuts.
  - **Dead Man's Switch**: Auto-unlocks after 60 minutes if connection is lost or teacher forgets.
  - **Fail-Safe**: Unlocks immediately if the network connection drops.
- **Disconnection**: Handles distinct messages when disconnected by the teacher ("Kicked").

## 🛠 Tech Stack
- **Runtime**: Electron
- **UI**: React + TypeScript (Hebrew/RTL support)
- **Networking**:
  - **Discovery**: UDP Broadcast (`dgram`)
  - **Real-time Comms**: `socket.io` (TCP)
- **Persistence**: `electron-store` for saving user preferences.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm / yarn

### Installation
```bash
git clone https://github.com/yourusername/attentive.git
cd attentive
npm install
```

### Running the Application
Currently, the application runs as a single codebase with a mode selector at startup.

```bash
# Start the development version
npm start
```
On launch, select **"אני מורה" (Teacher)** or **"אני תלמיד" (Student)**.

## 🏗 Architecture & Building

### Project Structure
- `src/main/`: Electron Main process (Window management, Network services, System locks).
- `src/ui/`: React Renderer process (UI layouts).
- `src/services/`: Core logic (Network logic, LockManager).
- `src/shared/`: Shared Types and Constants.

### Packaging
We use `electron-builder` with NSIS and MSI to create installers. 

- **MSI Installer**: Per-user installation, minimal UI. Handles firewall rules and automatically uninstalls legacy `v1.x` versions (machine-wide or per-user) before installation.
- **NSIS Installer**: Standard setup experience.

**Build Teacher Installer:**
```bash
npm run dist:teacher
```

**Build Student Installer:**
```bash
npm run dist:student
```

The output installers (`.exe` and `.msi`) will be in the `release/` directory.

## ⚠️ Important Notes
- **Firewall**: The installers automatically configure Windows Firewall rules for "Attentive" using an elevated helper (`elevate.exe`). If running from source, assume UDP Port `41234` and TCP Port `3000`/`3001` need to be allowed.
- **Legacy Migration**: The new MSI installers will automatically detect and uninstall previous versions matching `Attentive * 1.*` to ensure a clean transition to the per-user model.

## 🔄 Auto-Update Mechanism
The application uses `electron-updater` with a generic provider hosted on GitHub Pages.

### Configuration
1.  **Repo**: Updates are hosted at `https://outstaller.github.io/attentive/update-manager/`.
2.  **Structure**:
    - `.../update-manager/student/` -> Contains student updates (.exe, .msi, .blockmap, latest.yml)
    - `.../update-manager/teacher/` -> Contains teacher updates (.exe, .msi, .blockmap, latest.yml)

### How to Deploy an Update
1.  **Increment Version**: Update `version` in `package.json`.
2.  **Build**:
    ```bash
    npm run dist:teacher
    npm run dist:student
    ```
3.  **Upload**:
    - The GitHub Actions workflow automatically uploads the generated `.exe`, `.msi`, `.blockmap`, and `latest.yml` files to the GitHub Release and organizes them on the `gh-pages` branch.
    - If deploying manually, ensure all assets are copied to the respective folders under `update-manager/`.

## 📜 License
ISC
