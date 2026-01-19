export const UDP_PORT = 41234;
export const TCP_PORT = 3000;
export const MAX_LOCK_TIME_MS = 60 * 60 * 1000; // 60 minutes

// IPC Channels
export const CHANNELS = {
    START_TEACHER: 'start-teacher',
    STOP_TEACHER: 'stop-teacher',
    START_STUDENT: 'start-student',
    LOCK_STUDENT: 'lock-student',
    UNLOCK_STUDENT: 'unlock-student',
    LOCK_ALL: 'lock-all',
    UNLOCK_ALL: 'unlock-all',
    GET_STUDENTS: 'get-students',
    STUDENT_JOINED: 'student-joined',
    STUDENT_LEFT: 'student-left',
    STUDENT_STATUS_UPDATE: 'student-status-update',
    KICK_STUDENT: 'kick-student',
    KICK_ALL: 'kick-all',
    TEACHER_BEACON: 'teacher-beacon', // Main -> Renderer (Student)
    CONNECT_TO_CLASS: 'connect-to-class',
    SET_USER_INFO: 'set-user-info',
    GET_USER_INFO: 'get-user-info',
    APP_MODE: 'app-mode', // 'teacher' | 'student'
    STORE_GET: 'store-get',
    STORE_SET: 'store-set',
    LOG_ENTRY: 'log-entry',
};

export const UI_STRINGS = {
    teacher: {
        setupTitle: 'הגדרת כיתה',
        teacherName: 'שם המורה',
        className: 'שם השיעור או הכיתה',
        startClass: 'התחל שיעור',
        dashboardTitle: 'לוח בקרה למורה',
        classCode: 'קוד כיתה',
        password: 'סיסמא (אופציונלי)',
        lockAll: 'נעל את כולם',
        unlockAll: 'שחרר את כולם',
        students: 'תלמידים מחוברים',
        endClass: 'סיים שיעור וייצא נוכחות',
        disconnectAll: 'נתק את כולם',
        statusActive: 'פעיל',
        statusLocked: 'נעול',
        lockStudent: 'נעל תלמיד',
        unlockStudent: 'שחרר תלמיד',
        kickStudent: 'נתק תלמיד',
    },
    student: {
        registrationTitle: 'הרשמה',
        fullName: 'שם מלא',
        grade: 'כיתה / שכבה',
        saveAndContinue: 'שמור והמשך',
        classChooserTitle: 'בחר כיתה זמינה',
        enterPassword: 'הכנס סיסמה',
        passwordPlaceholder: 'סיסמה...',
        incorrectPassword: 'סיסמה שגויה',
        connect: 'התחבר',
        scanning: 'מחפש כיתות...',
        connectedTo: 'מחובר אל',
        waitingForTeacher: 'ממתין להוראות מהמורה...',
        screenLocked: 'עיניים אל המורה',
        disconnectedByTeacher: 'התנתקת מהשיעור על ידי המורה',
        backToMain: 'חזור למסך הראשי',
        privacyDisclaimer: 'למורה או לתוכנה זאת אין שום גישה לאף קובץ, תוכנה או משאב של מחשב זה. שום מידע מהמחשב אינו משותף עם המורה בכל צורה.',
    }
};
