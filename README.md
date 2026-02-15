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
We use `electron-builder` to create MSI installers for distribution and NSIS `.exe` for auto-updates.

#### Standard Installers (BYOD)
Per-machine MSI with firewall rules, all-users shortcuts, and auto-updates enabled.

```bash
npm run dist:student      # Student MSI + NSIS
npm run dist:teacher      # Teacher MSI + NSIS
```

#### GPO Installers (School Managed)
Per-machine MSI with firewall rules and all-users shortcuts, but **auto-updates disabled**. IT admins push new MSI versions via GPO.

```bash
npm run dist:student:gpo  # Student GPO MSI (no auto-update)
npm run dist:teacher:gpo  # Teacher GPO MSI (no auto-update)
```

Output: `release/student/`, `release/teacher/`, `release/student-gpo/`, `release/teacher-gpo/`.

## ⚠️ Important Notes
- **Firewall**: MSI installers configure Windows Firewall rules automatically during installation (runs elevated).
- **GPO Mode**: Installers with `gpo.flag` in resources skip auto-update checks. Updates are managed via GPO by replacing the MSI.
- If running from source, allow UDP Port `41234` and TCP Port `3000`/`3001`.

## 🔄 Auto-Update Mechanism
The application uses `electron-updater` with a generic provider hosted on GitHub Pages.
Auto-update uses the NSIS `.exe` (hidden from users) to apply updates to `Program Files`.

### Configuration
1.  **Repo**: Updates hosted at `https://outstaller.github.io/attentive/update-manager/`.
2.  **Structure**:
    - `.../update-manager/student/` -> NSIS `.exe`, `.blockmap`, `latest.yml`
    - `.../update-manager/teacher/` -> NSIS `.exe`, `.blockmap`, `latest.yml`

### How to Deploy an Update
1.  **Increment Version**: Update `version` in `package.json`.
2.  **Tag and Push**: Create a `v*` tag. GitHub Actions builds all 6 installers, uploads to Release, and publishes NSIS files to GitHub Pages for auto-update.

## 📜 License
ISC
