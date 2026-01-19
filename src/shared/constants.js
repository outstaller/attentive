"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UI_STRINGS = exports.CHANNELS = exports.MAX_LOCK_TIME_MS = exports.TCP_PORT = exports.UDP_PORT = void 0;
exports.UDP_PORT = 41234;
exports.TCP_PORT = 3000;
exports.MAX_LOCK_TIME_MS = 60 * 60 * 1000; // 60 minutes
// IPC Channels
exports.CHANNELS = {
    START_TEACHER: 'start-teacher',
    START_STUDENT: 'start-student',
    LOCK_STUDENT: 'lock-student',
    UNLOCK_STUDENT: 'unlock-student',
    LOCK_ALL: 'lock-all',
    UNLOCK_ALL: 'unlock-all',
    GET_STUDENTS: 'get-students',
    STUDENT_JOINED: 'student-joined',
    STUDENT_LEFT: 'student-left',
    STUDENT_STATUS_UPDATE: 'student-status-update',
    TEACHER_BEACON: 'teacher-beacon', // Main -> Renderer (Student)
    CONNECT_TO_CLASS: 'connect-to-class',
    SET_USER_INFO: 'set-user-info',
    GET_USER_INFO: 'get-user-info',
    APP_MODE: 'app-mode', // 'teacher' | 'student'
    STORE_GET: 'store-get',
    STORE_SET: 'store-set',
};
exports.UI_STRINGS = {
    teacher: {
        setupTitle: 'הגדרת כיתה',
        teacherName: 'שם המורה',
        className: 'שם הכיתה',
        startClass: 'התחל שיעור',
        dashboardTitle: 'לוח בקרה למורה',
        classCode: 'קוד כיתה',
        lockAll: 'נעל את כולם',
        unlockAll: 'שחרר את כולם',
        students: 'תלמידים מחוברים',
        endClass: 'סיים שיעור וייצא נוכחות',
        statusActive: 'פעיל',
        statusLocked: 'נעול',
    },
    student: {
        registrationTitle: 'הרשמה',
        fullName: 'שם מלא',
        grade: 'כיתה / שכבה',
        saveAndContinue: 'שמור והמשך',
        classChooserTitle: 'בחר כיתה זמינה',
        scanning: 'מחפש כיתות...',
        connectedTo: 'מחובר ל',
        waitingForTeacher: 'ממתין להוראות מהמורה...',
        screenLocked: 'עיניים אל המורה',
    }
};
//# sourceMappingURL=constants.js.map