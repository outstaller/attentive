export interface Student {
    id: string; // Unique ID (Name + Grade)
    socketId?: string; // Current Socket ID
    name: string;
    grade: string;
    ip: string;
    status: 'active' | 'locked' | 'idle' | 'disconnected';
    lastSeen: number;
    connectedAt?: number; // Start of current session
    totalDuration: number; // Accumulated minutes/ms from previous sessions
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
    relayId?: string; // For Internet Mode: Teacher's Socket ID on Relay
}

export interface LogEntry {
    timestamp: number;
    message: string;
    type?: 'info' | 'warning' | 'error';
}

