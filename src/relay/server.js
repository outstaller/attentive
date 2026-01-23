const { Server } = require("socket.io");
const http = require("http");

const PORT = process.env.PORT || 3000;
const httpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Relay Server Active');
});
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Adjust in production
    },
});

// State
const teachers = new Map(); // socketId -> { name, className, sessionId }

io.on("connection", (socket) => {
    console.log(`[${socket.id}] New connection`);

    // --- Teacher Events ---
    socket.on("register_teacher", (data, callback) => {
        console.log(`[${socket.id}] register_teacher: ${JSON.stringify(data)}`);

        // Check for duplicates
        for (const [id, teacher] of teachers.entries()) {
            if (teacher.className === data.className) {
                console.log(`   -> Registration REJECTED: Class name '${data.className}' already exists.`);
                if (typeof callback === 'function') callback({ success: false, error: 'שם הכיתה כבר קיים במערכת' });
                return;
            }
        }

        teachers.set(socket.id, { ...data, socketId: socket.id });
        if (typeof callback === 'function') callback({ success: true });
    });

    // --- Student Events ---
    socket.on("get_classes", (callback) => {
        // console.log(`[${socket.id}] get_classes`); // Too noisy?
        const classList = Array.from(teachers.values());
        if (typeof callback === 'function') {
            callback(classList);
        }
    });

    socket.on("join_class", ({ teacherSocketId, studentInfo }) => {
        console.log(`[${socket.id}] join_class -> Teacher: ${teacherSocketId}, Student: ${JSON.stringify(studentInfo)}`);
        const teacher = teachers.get(teacherSocketId);
        if (teacher) {
            console.log(`   -> Forwarding 'student_joined_relay' to Teacher ${teacherSocketId}`);
            io.to(teacherSocketId).emit("student_joined_relay", {
                studentSocketId: socket.id,
                info: studentInfo
            });
        } else {
            console.warn(`   -> Teacher ${teacherSocketId} NOT FOUND`);
            socket.emit("error", "Teacher not found");
        }
    });

    // --- Relay Logic (Forwarding) ---
    socket.on("relay_message", ({ targetSocketId, event, data }) => {
        console.log(`[${socket.id}] relay_message -> ${targetSocketId} [${event}]`);
        io.to(targetSocketId).emit(event, data);
    });

    socket.on("add_student_to_room", ({ studentSocketId }) => {
        const room = `class_${socket.id}`;
        console.log(`[${socket.id}] add_student_to_room: ${studentSocketId} -> ${room}`);
        const studentSocket = io.sockets.sockets.get(studentSocketId);
        if (studentSocket) {
            studentSocket.join(room);
        }
    });

    socket.on("relay_room_message", ({ room, event, data }) => {
        console.log(`[${socket.id}] relay_room_message -> ${room} [${event}]`);
        socket.to(room).emit(event, data);
    });

    // --- Disconnect ---
    socket.on("disconnect", (reason) => {
        console.log(`[${socket.id}] Disconnect: ${reason}`);
        if (teachers.has(socket.id)) {
            console.log(`   -> Teacher Removed: ${teachers.get(socket.id).name}`);
            teachers.delete(socket.id);
        }
    });
});

httpServer.listen(PORT, () => {
    console.log(`Relay server v1.0 running on port ${PORT}`);
});
