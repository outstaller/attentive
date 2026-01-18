export interface Student {
    id: string; // Socket ID
    name: string;
    grade: string;
    ip: string;
    status: 'active' | 'locked' | 'idle';
    lastSeen: number;
}

export interface ClassSession {
    teacherName: string;
    className: string;
    classCode: string; // Generated unique code
    port: number; // TCP port
    ip: string; // Teacher IP
}

export enum PacketType {
    BEACON = 'BEACON',
}

export interface BeaconPacket {
    type: PacketType.BEACON;
    teacher: string;
    class: string;
    ip: string;
    port: number;
    isSecured: boolean;
    sessionId?: string; // Unique ID for deduplication
}

export interface LogEntry {
    timestamp: number;
    message: string;
    type?: 'info' | 'warning' | 'error';
}

