import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ipcRenderer, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { CHANNELS, UI_STRINGS } from '../shared/constants';
import { BeaconPacket, Student, LogEntry } from '../shared/types';

// --- Type Extensions ---
// Since we are not using a full build pipeline with proper global extension via d.ts for this snippet
// we assume ipcRenderer is available globally or via import.

const App = () => {
    const [mode, setMode] = useState<'selection' | 'teacher' | 'student'>('selection');

    // teacher state
    const [teacherName, setTeacherName] = useState('');
    const [className, setClassName] = useState('');
    const [isClassStarted, setIsClassStarted] = useState(false);
    const [students, setStudents] = useState<Student[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    // student state
    const [studentName, setStudentName] = useState('');
    const [studentGrade, setStudentGrade] = useState('');
    const [discoveredClasses, setDiscoveredClasses] = useState<BeaconPacket[]>([]);
    const [connectedStatus, setConnectedStatus] = useState<'disconnected' | 'connected' | 'kicked'>('disconnected');
    const [connectedTeacher, setConnectedTeacher] = useState<string>('');
    const [connectedClassName, setConnectedClassName] = useState<string>('');
    const [teacherPassword, setTeacherPassword] = useState('');
    const [lockTimeout, setLockTimeout] = useState('60');
    const [passwordPromptClass, setPasswordPromptClass] = useState<BeaconPacket | null>(null);
    const [inputPassword, setInputPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [showStopConfirm, setShowStopConfirm] = useState(false);

    // Load Settings & IPC Listeners
    useEffect(() => {
        const loadSettings = async () => {
            const tName = await ipcRenderer.invoke(CHANNELS.STORE_GET, 'teacherName');
            if (tName) setTeacherName(tName);
            const cName = await ipcRenderer.invoke(CHANNELS.STORE_GET, 'className');
            if (cName) setClassName(cName);
            const sName = await ipcRenderer.invoke(CHANNELS.STORE_GET, 'studentName');
            if (sName) setStudentName(sName);
            const sGrade = await ipcRenderer.invoke(CHANNELS.STORE_GET, 'studentGrade');
            if (sGrade) setStudentGrade(sGrade);
            const lTimeout = await ipcRenderer.invoke(CHANNELS.STORE_GET, 'lockTimeout');
            if (lTimeout) setLockTimeout(lTimeout);

            // Check for enforced mode
            const enforcedMode = await ipcRenderer.invoke(CHANNELS.APP_MODE);
            if (enforcedMode === 'teacher') {
                setMode('teacher');
                // Auto-start?? Maybe just show teacher dashboard ready to start.
                // User still needs to click Start Class usually, but if we want seamless:
                // For now, just switching to the view is enough.
            } else if (enforcedMode === 'student') {
                setMode('student');
                // Auto-start discovery
                ipcRenderer.send(CHANNELS.START_STUDENT);
            }
        };
        loadSettings();
    }, []);

    const saveSetting = (key: string, val: string) => {
        ipcRenderer.send(CHANNELS.STORE_SET, key, val);
    };

    useEffect(() => {
        // Define listeners
        const handleGetStudents = (e: any, list: Student[]) => {
            setStudents(list);
        };

        const handleTeacherBeacon = (e: any, packet: BeaconPacket) => {
            setDiscoveredClasses(prev => {
                const now = Date.now();
                // Dedup by sessionId if available, otherwise by ip+port
                const index = prev.findIndex(c => {
                    if (packet.sessionId && c.sessionId) {
                        return c.sessionId === packet.sessionId;
                    }
                    return c.ip === packet.ip && c.port === packet.port;
                });

                const packetWithTime = { ...packet, lastSeen: now };

                if (index !== -1) {
                    const { lastSeen: _, ...oldP } = prev[index] as any;
                    const { lastSeen: __, ...newP } = packetWithTime as any;

                    // If content changed (e.g. IP changed or name changed), update
                    if (JSON.stringify(oldP) !== JSON.stringify(newP)) {
                        const newClasses = [...prev];
                        newClasses[index] = packetWithTime;
                        return newClasses;
                    }
                    // Just update timestamp
                    const newClasses = [...prev];
                    newClasses[index] = packetWithTime;
                    return newClasses;
                }
                return [...prev, packetWithTime];
            });
        };

        const handleStatusUpdate = (e: any, status: any, msg: any) => {
            if (status === 'error') {
                if (msg.includes('timeout') || msg.includes('xhr poll error')) {
                    alert('החיבור לכיתה נכשל. ייתכן שהכיתה אינה זמינה כעת.');
                }
                setErrorMessage(msg === 'Invalid password' ? UI_STRINGS.student.incorrectPassword : msg);
            } else {
                setConnectedStatus(status);
                if (status === 'connected') {
                    setPasswordPromptClass(null);
                    setErrorMessage('');
                }
            }
        }


        const handleLogEntry = (e: any, log: LogEntry) => {
            setLogs(prev => [log, ...prev]);
        };

        // Prune old classes
        const pruneInterval = setInterval(() => {
            setDiscoveredClasses(prev => prev.filter(c => Date.now() - ((c as any).lastSeen || 0) < 5000));
        }, 1000);

        // Register
        ipcRenderer.on(CHANNELS.GET_STUDENTS, handleGetStudents);
        ipcRenderer.on(CHANNELS.TEACHER_BEACON, handleTeacherBeacon);
        ipcRenderer.on(CHANNELS.STUDENT_STATUS_UPDATE, handleStatusUpdate);
        ipcRenderer.on(CHANNELS.LOG_ENTRY, handleLogEntry);

        return () => {
            ipcRenderer.removeListener(CHANNELS.GET_STUDENTS, handleGetStudents);
            ipcRenderer.removeListener(CHANNELS.TEACHER_BEACON, handleTeacherBeacon);
            ipcRenderer.removeListener(CHANNELS.STUDENT_STATUS_UPDATE, handleStatusUpdate);
            ipcRenderer.removeListener(CHANNELS.LOG_ENTRY, handleLogEntry);
        };
    }, []);

    const startTeacher = () => {
        if (!teacherName.trim() || !className.trim()) {
            setErrorMessage('נא למלא את כל שדות החובה');
            return;
        }
        setErrorMessage('');
        ipcRenderer.send(CHANNELS.START_TEACHER, {
            name: teacherName,
            className,
            password: teacherPassword,
            lockTimeout: parseInt(lockTimeout) || 60
        });
        setIsClassStarted(true);
    };

    const stopTeacher = () => {
        setShowStopConfirm(true);
    };

    const confirmStopTeacher = () => {
        ipcRenderer.send(CHANNELS.STOP_TEACHER);
        setIsClassStarted(false);
        setStudents([]);
        setLogs([]);
        setShowStopConfirm(false);
    };

    const startStudentMode = () => {
        setMode('student');
        ipcRenderer.send(CHANNELS.START_STUDENT);
    };

    const handleClassClick = (cls: BeaconPacket) => {
        if (!studentName || !studentGrade) {
            alert('אנא מלא שם וכיתה');
            return;
        }

        if (cls.isSecured) {
            setPasswordPromptClass(cls);
            setInputPassword('');
            setErrorMessage('');
        } else {
            performConnect(cls);
        }
    };

    const performConnect = (cls: BeaconPacket, password?: string) => {
        ipcRenderer.send(CHANNELS.CONNECT_TO_CLASS, {
            ip: cls.ip,
            port: cls.port,
            studentInfo: { name: studentName, grade: studentGrade },
            password
        });
        setConnectedTeacher(cls.teacher);
        setConnectedClassName(cls.class);
    };

    const lockAll = () => ipcRenderer.send(CHANNELS.LOCK_ALL);
    const unlockAll = () => ipcRenderer.send(CHANNELS.UNLOCK_ALL);
    const lockStudent = (id: string) => ipcRenderer.send(CHANNELS.LOCK_STUDENT, id);
    const unlockStudent = (id: string) => ipcRenderer.send(CHANNELS.UNLOCK_STUDENT, id);
    const kickAll = () => ipcRenderer.send(CHANNELS.KICK_ALL);
    const kickStudent = (id: string) => ipcRenderer.send(CHANNELS.KICK_STUDENT, id);

    const generateAttendanceList = () => {
        const sortedStudents = [...students].sort((a, b) => a.name.localeCompare(b.name));
        const date = new Date().toLocaleString('he-IL');

        const htmlContent = `
            <!DOCTYPE html>
            <html lang="he" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>רשימת נוכחות</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h1 { text-align: center; }
                    .meta { margin-bottom: 20px; font-size: 1.2em; text-align: center; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 12px; text-align: right; }
                    th { background-color: #f2f2f2; }
                    tr:nth-child(even) { background-color: #f9f9f9; }
                </style>
            </head>
            <body>
                <h1>רשימת נוכחות - ${className}</h1>
                <div class="meta">
                    מורה: ${teacherName}<br>
                    תאריך: ${date}<br>
                    סה"כ תלמידים: ${sortedStudents.length}
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>שם התלמיד</th>
                            <th>כיתה</th>
                            <th>זמן חיבור</th>
                            <th>סטטוס</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedStudents.map((s, index) => {
            let durationMs = s.totalDuration || 0;
            if (s.connectedAt) {
                durationMs += (Date.now() - s.connectedAt);
            }
            const minutes = Math.floor(durationMs / 60000);
            const seconds = Math.floor((durationMs % 60000) / 1000);
            return `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${s.name}</td>
                            <td>${s.grade}</td>
                            <td>${minutes} דק' ${seconds} שנ'</td>
                            <td>${s.status === 'locked' ? 'נעול' : s.status === 'disconnected' ? 'מנותק' : 'פעיל'}</td>
                        </tr>
                        `;
        }).join('')}
                    </tbody>
                </table>
            </body>
            </html>
        `;

        const filename = `attendance_${Date.now()}.html`;
        const filePath = path.join(os.tmpdir(), filename);

        fs.writeFileSync(filePath, htmlContent);
        shell.openPath(filePath);
    };

    // --- Render Selection ---
    if (mode === 'selection') {
        return (
            <div style={styles.container}>
                <h1>ברוכים הבאים ל-Attentive</h1>
                <div style={styles.row}>
                    <button style={styles.bigButton} onClick={() => setMode('teacher')}>אני מורה 👨‍🏫</button>
                    <button style={styles.bigButton} onClick={startStudentMode}>אני תלמיד 👨‍🎓</button>
                </div>
            </div>
        );
    }

    // --- Render Teacher ---
    if (mode === 'teacher') {
        return (
            <div style={styles.container}>
                <div style={{ ...styles.header, display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl' }}>
                    <h2>{UI_STRINGS.teacher.dashboardTitle} - {teacherName.replace(/^המורה\s+/, '')}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', direction: 'ltr' }}>
                        <img src="assets/logo.png" style={{ height: 50, marginRight: 10 }} alt="logo" />
                        {isClassStarted && (
                            <button
                                style={{ ...styles.dangerButton, background: 'transparent', color: 'red', border: '1px solid red', fontSize: 16, padding: '5px 10px', marginRight: 20 }}
                                onClick={stopTeacher}
                                title="סיים שיעור"
                            >
                                ❌ סגור כיתה
                            </button>
                        )}
                    </div>
                </div>

                {!isClassStarted ? (
                    <form style={styles.card} onSubmit={(e) => { e.preventDefault(); startTeacher(); }}>
                        <h3>{UI_STRINGS.teacher.setupTitle}</h3>
                        <input
                            style={styles.input}
                            placeholder={UI_STRINGS.teacher.teacherName}
                            value={teacherName}
                            onChange={e => { setTeacherName(e.target.value); saveSetting('teacherName', e.target.value); }}
                        />
                        <input
                            style={styles.input}
                            placeholder={UI_STRINGS.teacher.className}
                            value={className}
                            onChange={e => { setClassName(e.target.value); saveSetting('className', e.target.value); }}
                        />
                        <input
                            style={styles.input}
                            placeholder={UI_STRINGS.teacher.password}
                            value={teacherPassword}
                            type="password"
                            onChange={e => setTeacherPassword(e.target.value)}
                        />
                        <div style={{ marginTop: 10 }}>
                            <label style={{ marginRight: 10, fontSize: 14 }}>זמן נעילה מקסימלי (דקות):</label>
                            <input
                                style={{ ...styles.input, width: 80 }}
                                type="number"
                                min="1"
                                value={lockTimeout}
                                onChange={e => { setLockTimeout(e.target.value); saveSetting('lockTimeout', e.target.value); }}
                            />
                        </div>
                        {errorMessage && <p style={{ color: 'red', marginTop: 5 }}>{errorMessage}</p>}
                        <button type="submit" style={styles.primaryButton}>{UI_STRINGS.teacher.startClass}</button>
                    </form>
                ) : (
                    <>
                        <div style={{ ...styles.card, width: '90%' }}>
                            <div style={styles.controls}>
                                <div>
                                    <strong>שיעור: {className} </strong> | IP: {require('ip').address()}
                                </div>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <button style={styles.dangerButton} onClick={lockAll}>{UI_STRINGS.teacher.lockAll}</button>
                                    <button style={styles.successButton} onClick={unlockAll}>{UI_STRINGS.teacher.unlockAll}</button>
                                    <button style={{ ...styles.dangerButton, background: '#8b0000', marginLeft: 0 }} onClick={kickAll}>{UI_STRINGS.teacher.disconnectAll}</button>
                                    <button style={styles.primaryButton} onClick={generateAttendanceList}>רשימת נוכחות 📋</button>
                                </div>
                            </div>
                            <div style={{ padding: '0 20px', marginBottom: 10, fontWeight: 'bold' }}>
                                {UI_STRINGS.teacher.students}: {students.length}
                            </div>
                            <div style={styles.grid}>
                                {students.map(s => (
                                    <div key={s.id} style={{
                                        ...styles.studentCard,
                                        border: s.status === 'locked' ? '2px solid red' : s.status === 'disconnected' ? '1px solid #ccc' : '1px solid #ddd',
                                        opacity: s.status === 'disconnected' ? 0.6 : 1,
                                        backgroundColor: s.status === 'disconnected' ? '#f5f5f5' : 'white'
                                    }}>
                                        <div style={{ ...styles.studentName, color: s.status === 'disconnected' ? '#888' : 'black' }}>{s.name}</div>
                                        <div style={styles.studentGrade}>{s.grade}</div>
                                        <div style={{ ...styles.status, color: s.status === 'disconnected' ? '#888' : 'black' }}>
                                            {s.status === 'locked' ? UI_STRINGS.teacher.statusLocked :
                                                s.status === 'disconnected' ? 'מנותק' : UI_STRINGS.teacher.statusActive}
                                        </div>
                                        <div style={styles.actions}>
                                            {s.status === 'active' || s.status === 'locked' ? (
                                                <>
                                                    {s.status === 'locked' ? (
                                                        <IconButton onClick={() => unlockStudent(s.id)} icon="🔓" title={UI_STRINGS.teacher.unlockStudent} />
                                                    ) : (
                                                        <IconButton onClick={() => lockStudent(s.id)} icon="🔒" title={UI_STRINGS.teacher.lockStudent} />
                                                    )}
                                                    <IconButton onClick={() => kickStudent(s.id)} icon="❌" title={UI_STRINGS.teacher.kickStudent} />
                                                </>
                                            ) : (
                                                <div style={{ height: 28 }}></div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ ...styles.card, ...styles.logContainer, marginTop: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                <h4 style={{ margin: 0 }}>יומן פעילות</h4>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }} onClick={() => setLogs([])} title="נקה יומן">🗑️</button>
                            </div>
                            <div style={styles.logList}>
                                {logs.length === 0 && <div style={{ color: '#aaa', fontStyle: 'italic', padding: 10 }}>אין פעילות להצגה</div>}
                                {logs.map((log, i) => (
                                    <div key={i} style={{ ...styles.logItem, borderRight: log.type === 'error' ? '3px solid red' : log.type === 'warning' ? '3px solid orange' : '3px solid #007bff' }}>
                                        <span style={styles.logTime}>{new Date(log.timestamp).toLocaleTimeString('he-IL')}</span>
                                        <span style={styles.logMessage}>{log.message}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {showStopConfirm && (
                    <div style={styles.modalOverlay}>
                        <div style={{ ...styles.card, width: 300, textAlign: 'center' }}>
                            <h3>סיים שיעור?</h3>
                            <p>האם אתה בטוח שברצונך לסיים את השיעור ולנתק את כולם?</p>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 20 }}>
                                <button style={styles.dangerButton} onClick={confirmStopTeacher}>כן, סגור כיתה</button>
                                <button style={styles.primaryButton} onClick={() => setShowStopConfirm(false)}>לא, המשך שיעור</button>
                            </div>
                        </div>
                    </div>
                )}
            </div >
        );
    }

    // --- Render Student ---
    if (mode === 'student') {
        if (connectedStatus === 'connected') {
            return (
                <div style={styles.container}>
                    <div style={styles.successMessage}>
                        <h1>✅</h1>
                        <h2>{UI_STRINGS.student.connectedTo} {connectedTeacher}</h2>
                        <h1 style={{ marginTop: 0, fontWeight: 'normal' }}>{connectedClassName}</h1>
                        <p>{UI_STRINGS.student.waitingForTeacher}</p>
                        <p style={{ marginTop: 20, fontSize: '0.8em', color: '#666', maxWidth: 400 }}>
                            {UI_STRINGS.student.privacyDisclaimer}
                        </p>
                    </div>
                </div>
            )
        }

        if (connectedStatus === 'kicked') {
            return (
                <div style={styles.container}>
                    <div style={{ ...styles.card, textAlign: 'center' }}>
                        <h1>🚫</h1>
                        <h2>{UI_STRINGS.student.disconnectedByTeacher}</h2>
                        <button style={styles.primaryButton} onClick={() => {
                            setConnectedStatus('disconnected');
                            // Start discovery again effectively by just resetting state
                            ipcRenderer.send(CHANNELS.START_STUDENT);
                        }}>{UI_STRINGS.student.backToMain}</button>
                    </div>
                </div>
            )
        }

        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <h3>{UI_STRINGS.student.registrationTitle}</h3>
                    <input
                        style={styles.input}
                        placeholder={UI_STRINGS.student.fullName}
                        value={studentName}
                        onChange={e => { setStudentName(e.target.value); saveSetting('studentName', e.target.value); }}
                    />
                    <input
                        style={styles.input}
                        placeholder={UI_STRINGS.student.grade}
                        value={studentGrade}
                        onChange={e => { setStudentGrade(e.target.value); saveSetting('studentGrade', e.target.value); }}
                    />
                </div>

                <div style={styles.card}>
                    <h3>{UI_STRINGS.student.classChooserTitle}</h3>
                    {discoveredClasses.length === 0 && <p>{UI_STRINGS.student.scanning}</p>}
                    <div style={styles.list}>
                        {discoveredClasses.map((cls, i) => (
                            <div key={i} style={styles.listItem} onClick={() => handleClassClick(cls)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <strong>{cls.class}</strong> - {cls.teacher}
                                    </div>
                                    {cls.isSecured && <span>🔑</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {passwordPromptClass && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center'
                    }}>
                        <div style={styles.card}>
                            <h3>{UI_STRINGS.student.enterPassword}</h3>
                            <p>{UI_STRINGS.student.connectedTo} {passwordPromptClass.class}</p>
                            <input
                                style={styles.input}
                                type="password"
                                placeholder={UI_STRINGS.student.passwordPlaceholder}
                                value={inputPassword}
                                onChange={e => setInputPassword(e.target.value)}
                            />
                            {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                <button style={styles.dangerButton} onClick={() => setPasswordPromptClass(null)}>ביטול</button>
                                <button style={styles.primaryButton} onClick={() => performConnect(passwordPromptClass, inputPassword)}>
                                    {UI_STRINGS.student.connect}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return null;
};

// --- Styles ---
const styles: { [key: string]: React.CSSProperties } = {
    container: { padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', gap: 20, overflowY: 'auto' },
    row: { display: 'flex', gap: 20 },
    header: { width: '100%', borderBottom: '1px solid #ccc', paddingBottom: 10, marginBottom: 20 },
    card: { background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 5px rgba(0,0,0,0.1)', width: 400, display: 'flex', flexDirection: 'column', gap: 10 },
    bigButton: { padding: '20px 40px', fontSize: 20, cursor: 'pointer', borderRadius: 8, border: 'none', background: '#007bff', color: 'white' },
    input: { padding: 10, fontSize: 16, borderRadius: 4, border: '1px solid #ccc', textAlign: 'right' }, // RTL
    primaryButton: { padding: 10, background: '#007bff', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' },
    dangerButton: { padding: 10, background: '#dc3545', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' },
    successButton: { padding: 10, background: '#28a745', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' },
    controls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, width: '100%' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 15, width: '100%' },
    studentCard: { padding: 15, background: 'white', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    studentName: { fontWeight: 'bold', fontSize: 18 },
    studentGrade: { color: '#666' },
    status: { margin: '5px 0', fontSize: 12 },
    actions: { marginTop: 10, display: 'flex', gap: 10 },
    list: { display: 'flex', flexDirection: 'column', gap: 10 },
    listItem: { padding: 10, border: '1px solid #eee', borderRadius: 4, cursor: 'pointer', background: '#f9f9f9' },
    successMessage: { textAlign: 'center', marginTop: 50 },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    logContainer: { width: '90%', height: 250, display: 'flex', flexDirection: 'column' },
    logList: { flex: 1, overflowY: 'auto', background: '#f9f9f9', border: '1px solid #eee', borderRadius: 4, padding: 5 },
    logItem: { padding: '5px 10px', fontSize: 13, borderBottom: '1px solid #eee', display: 'flex', gap: 10 },
    logTime: { color: '#888', minWidth: 60 },
    logMessage: { flex: 1 },
};

const IconButton = ({ onClick, icon, title, color = 'black' }: { onClick: () => void, icon: string, title: string, color?: string }) => {
    const [hover, setHover] = useState(false);
    return (
        <button
            onClick={onClick}
            title={title}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.2em',
                transform: hover ? 'scale(1.2)' : 'scale(1)',
                transition: 'transform 0.2s',
                color: color
            }}
        >
            {icon}
        </button>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
