"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function () { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function (o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function (o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function (o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const client_1 = __importDefault(require("react-dom/client"));
const electron_1 = require("electron");
const constants_1 = require("../shared/constants");
// --- Type Extensions ---
// Since we are not using a full build pipeline with proper global extension via d.ts for this snippet
// we assume ipcRenderer is available globally or via import.
const App = () => {
    const [mode, setMode] = (0, react_1.useState)('selection');
    // teacher state
    const [teacherName, setTeacherName] = (0, react_1.useState)('המורה יוסי');
    const [className, setClassName] = (0, react_1.useState)('מתמטיקה ח׳3');
    const [isClassStarted, setIsClassStarted] = (0, react_1.useState)(false);
    const [students, setStudents] = (0, react_1.useState)([]);
    // student state
    const [studentName, setStudentName] = (0, react_1.useState)('');
    const [studentGrade, setStudentGrade] = (0, react_1.useState)('');
    const [discoveredClasses, setDiscoveredClasses] = (0, react_1.useState)([]);
    const [connectedStatus, setConnectedStatus] = (0, react_1.useState)('disconnected');
    const [connectedTeacher, setConnectedTeacher] = (0, react_1.useState)('');
    // Load Settings
    (0, react_1.useEffect)(() => {
        const loadSettings = () => __awaiter(void 0, void 0, void 0, function* () {
            const tName = yield electron_1.ipcRenderer.invoke(constants_1.CHANNELS.STORE_GET, 'teacherName');
            if (tName)
                setTeacherName(tName);
            const cName = yield electron_1.ipcRenderer.invoke(constants_1.CHANNELS.STORE_GET, 'className');
            if (cName)
                setClassName(cName);
            const sName = yield electron_1.ipcRenderer.invoke(constants_1.CHANNELS.STORE_GET, 'studentName');
            if (sName)
                setStudentName(sName);
            const sGrade = yield electron_1.ipcRenderer.invoke(constants_1.CHANNELS.STORE_GET, 'studentGrade');
            if (sGrade)
                setStudentGrade(sGrade);
        });
        loadSettings();
    }, []);
    const saveSetting = (key, val) => {
        electron_1.ipcRenderer.send(constants_1.CHANNELS.STORE_SET, key, val);
    };
    (0, react_1.useEffect)(() => {
        // Teacher Listeners
        electron_1.ipcRenderer.on(constants_1.CHANNELS.GET_STUDENTS, (e, list) => {
            setStudents(list);
        });
        // Student Listeners
        electron_1.ipcRenderer.on(constants_1.CHANNELS.TEACHER_BEACON, (e, packet) => {
            setDiscoveredClasses(prev => {
                // Avoid duplicates
                if (prev.some(c => c.ip === packet.ip && c.port === packet.port))
                    return prev;
                return [...prev, packet];
            });
        });
        electron_1.ipcRenderer.on(constants_1.CHANNELS.STUDENT_STATUS_UPDATE, (e, status) => {
            setConnectedStatus(status);
        });
        return () => {
            electron_1.ipcRenderer.removeAllListeners(constants_1.CHANNELS.GET_STUDENTS);
            electron_1.ipcRenderer.removeAllListeners(constants_1.CHANNELS.TEACHER_BEACON);
            electron_1.ipcRenderer.removeAllListeners(constants_1.CHANNELS.STUDENT_STATUS_UPDATE);
        };
    }, []);
    const startTeacher = () => {
        electron_1.ipcRenderer.send(constants_1.CHANNELS.START_TEACHER, { name: teacherName, className });
        setIsClassStarted(true);
    };
    const startStudentMode = () => {
        setMode('student');
        electron_1.ipcRenderer.send(constants_1.CHANNELS.START_STUDENT);
    };
    const connectToClass = (cls) => {
        if (!studentName || !studentGrade) {
            alert('אנא מלא שם וכיתה');
            return;
        }
        electron_1.ipcRenderer.send(constants_1.CHANNELS.CONNECT_TO_CLASS, {
            ip: cls.ip,
            port: cls.port,
            studentInfo: { name: studentName, grade: studentGrade }
        });
        setConnectedTeacher(cls.teacher);
    };
    const lockAll = () => electron_1.ipcRenderer.send(constants_1.CHANNELS.LOCK_ALL);
    const unlockAll = () => electron_1.ipcRenderer.send(constants_1.CHANNELS.UNLOCK_ALL);
    const lockStudent = (id) => electron_1.ipcRenderer.send(constants_1.CHANNELS.LOCK_STUDENT, id);
    const unlockStudent = (id) => electron_1.ipcRenderer.send(constants_1.CHANNELS.UNLOCK_STUDENT, id);
    // --- Render Selection ---
    if (mode === 'selection') {
        return (react_1.default.createElement("div", { style: styles.container },
            react_1.default.createElement("h1", null, "\u05D1\u05E8\u05D5\u05DB\u05D9\u05DD \u05D4\u05D1\u05D0\u05D9\u05DD \u05DC-Attentive"),
            react_1.default.createElement("div", { style: styles.row },
                react_1.default.createElement("button", { style: styles.bigButton, onClick: () => setMode('teacher') }, "\u05D0\u05E0\u05D9 \u05DE\u05D5\u05E8\u05D4 \uD83D\uDC68\u200D\uD83C\uDFEB"),
                react_1.default.createElement("button", { style: styles.bigButton, onClick: startStudentMode }, "\u05D0\u05E0\u05D9 \u05EA\u05DC\u05DE\u05D9\u05D3 \uD83D\uDC68\u200D\uD83C\uDF93"))));
    }
    // --- Render Teacher ---
    if (mode === 'teacher') {
        return (react_1.default.createElement("div", { style: styles.container },
            react_1.default.createElement("div", { style: styles.header },
                react_1.default.createElement("h2", null, constants_1.UI_STRINGS.teacher.dashboardTitle)),
            !isClassStarted ? (react_1.default.createElement("div", { style: styles.card },
                react_1.default.createElement("h3", null, constants_1.UI_STRINGS.teacher.setupTitle),
                react_1.default.createElement("input", { style: styles.input, placeholder: constants_1.UI_STRINGS.teacher.teacherName, value: teacherName, onChange: e => { setTeacherName(e.target.value); saveSetting('teacherName', e.target.value); } }),
                react_1.default.createElement("input", { style: styles.input, placeholder: constants_1.UI_STRINGS.teacher.className, value: className, onChange: e => { setClassName(e.target.value); saveSetting('className', e.target.value); } }),
                react_1.default.createElement("button", { style: styles.primaryButton, onClick: startTeacher }, constants_1.UI_STRINGS.teacher.startClass))) : (react_1.default.createElement("div", { style: Object.assign(Object.assign({}, styles.card), { width: '90%' }) },
                    react_1.default.createElement("div", { style: styles.controls },
                        react_1.default.createElement("div", null,
                            react_1.default.createElement("strong", null,
                                "\u05E9\u05D9\u05E2\u05D5\u05E8: ",
                                className,
                                " "),
                            " | IP: ",
                            require('ip').address()),
                        react_1.default.createElement("div", null,
                            react_1.default.createElement("button", { style: styles.dangerButton, onClick: lockAll }, constants_1.UI_STRINGS.teacher.lockAll),
                            react_1.default.createElement("button", { style: styles.successButton, onClick: unlockAll }, constants_1.UI_STRINGS.teacher.unlockAll))),
                    react_1.default.createElement("div", { style: styles.grid }, students.map(s => (react_1.default.createElement("div", { key: s.id, style: Object.assign(Object.assign({}, styles.studentCard), { border: s.status === 'locked' ? '2px solid red' : '1px solid #ddd' }) },
                        react_1.default.createElement("div", { style: styles.studentName }, s.name),
                        react_1.default.createElement("div", { style: styles.studentGrade }, s.grade),
                        react_1.default.createElement("div", { style: styles.status }, s.status === 'locked' ? constants_1.UI_STRINGS.teacher.statusLocked : constants_1.UI_STRINGS.teacher.statusActive),
                        react_1.default.createElement("div", { style: styles.actions }, s.status === 'locked' ? (react_1.default.createElement("button", { onClick: () => unlockStudent(s.id) }, "\uD83D\uDD13")) : (react_1.default.createElement("button", { onClick: () => lockStudent(s.id) }, "\uD83D\uDD12")))))))))));
    }
    // --- Render Student ---
    if (mode === 'student') {
        if (connectedStatus === 'connected') {
            return (react_1.default.createElement("div", { style: styles.container },
                react_1.default.createElement("div", { style: styles.successMessage },
                    react_1.default.createElement("h1", null, "\u2705"),
                    react_1.default.createElement("h2", null,
                        constants_1.UI_STRINGS.student.connectedTo,
                        "",
                        connectedTeacher),
                    react_1.default.createElement("p", null, constants_1.UI_STRINGS.student.waitingForTeacher))));
        }
        return (react_1.default.createElement("div", { style: styles.container },
            react_1.default.createElement("div", { style: styles.card },
                react_1.default.createElement("h3", null, constants_1.UI_STRINGS.student.registrationTitle),
                react_1.default.createElement("input", { style: styles.input, placeholder: constants_1.UI_STRINGS.student.fullName, value: studentName, onChange: e => { setStudentName(e.target.value); saveSetting('studentName', e.target.value); } }),
                react_1.default.createElement("input", { style: styles.input, placeholder: constants_1.UI_STRINGS.student.grade, value: studentGrade, onChange: e => { setStudentGrade(e.target.value); saveSetting('studentGrade', e.target.value); } })),
            react_1.default.createElement("div", { style: styles.card },
                react_1.default.createElement("h3", null, constants_1.UI_STRINGS.student.classChooserTitle),
                discoveredClasses.length === 0 && react_1.default.createElement("p", null, constants_1.UI_STRINGS.student.scanning),
                react_1.default.createElement("div", { style: styles.list }, discoveredClasses.map((cls, i) => (react_1.default.createElement("div", { key: i, style: styles.listItem, onClick: () => connectToClass(cls) },
                    react_1.default.createElement("strong", null, cls.class),
                    " - ",
                    cls.teacher)))))));
    }
    return null;
};
// --- Styles ---
const styles = {
    container: { padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', gap: 20 },
    row: { display: 'flex', gap: 20 },
    header: { width: '100%', borderBottom: '1px solid #ccc', paddingBottom: 10, marginBottom: 20 },
    card: { background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 2px 5px rgba(0,0,0,0.1)', width: 400, display: 'flex', flexDirection: 'column', gap: 10 },
    bigButton: { padding: '20px 40px', fontSize: 20, cursor: 'pointer', borderRadius: 8, border: 'none', background: '#007bff', color: 'white' },
    input: { padding: 10, fontSize: 16, borderRadius: 4, border: '1px solid #ccc', textAlign: 'right' }, // RTL
    primaryButton: { padding: 10, background: '#007bff', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' },
    dangerButton: { padding: 10, background: '#dc3545', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', marginLeft: 10 },
    successButton: { padding: 10, background: '#28a745', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' },
    controls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, width: '100%' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 15, width: '100%' },
    studentCard: { padding: 15, background: 'white', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    studentName: { fontWeight: 'bold', fontSize: 18 },
    studentGrade: { color: '#666' },
    status: { margin: '5px 0', fontSize: 12 },
    actions: { marginTop: 10 },
    list: { display: 'flex', flexDirection: 'column', gap: 10 },
    listItem: { padding: 10, border: '1px solid #eee', borderRadius: 4, cursor: 'pointer', background: '#f9f9f9' },
    successMessage: { textAlign: 'center', marginTop: 50 },
};
const root = client_1.default.createRoot(document.getElementById('root'));
root.render(react_1.default.createElement(App, null));
//# sourceMappingURL=App.js.map