const { io } = require('socket.io-client');

const RELAY_URL = 'http://localhost:3000';

async function testRelay() {
    console.log('--- Starting Relay Test ---');

    // 1. Setup Teacher
    const teacherSocket = io(RELAY_URL);
    let teacherRelayId = '';

    await new Promise((resolve) => {
        teacherSocket.on('connect', () => {
            console.log('Teacher connected to Relay');
            teacherRelayId = teacherSocket.id;
            teacherSocket.emit('register_teacher', {
                name: 'Test Teacher',
                className: 'Math 101',
                isSecured: false
            });
            setTimeout(resolve, 500);
        });
    });

    // 2. Setup Student
    const studentSocket = io(RELAY_URL);

    await new Promise((resolve) => {
        studentSocket.on('connect', () => {
            console.log('Student connected to Relay');
            resolve();
        });
    });

    // 3. Student fetches classes
    console.log('Student fetching classes...');
    await new Promise((resolve) => {
        studentSocket.emit('get_classes', (classes) => {
            console.log('Classes found:', classes);
            const target = classes.find(c => c.name === 'Test Teacher');
            if (target) {
                console.log('Target teacher found!');
                resolve();
            } else {
                console.error('Target teacher NOT found');
                process.exit(1);
            }
        });
    });

    // 4. Student Joins
    console.log('Student joining teacher...');
    studentSocket.emit('join_class', {
        teacherSocketId: teacherSocket.id,
        studentInfo: { name: 'Student 1', grade: 'A' }
    });

    // 5. Teacher Receives Join Event
    await new Promise((resolve) => {
        teacherSocket.on('student_joined_relay', (data) => {
            console.log('Teacher received join request:', data);

            // 6. Teacher Sends Lock Command
            console.log('Teacher sending LOCK...');
            teacherSocket.emit('relay_message', {
                targetSocketId: data.studentSocketId,
                event: 'lock-student',
                data: { timeout: 5 }
            });
            resolve();
        });
    });

    // 7. Student Receives Lock
    await new Promise((resolve) => {
        studentSocket.on('lock-student', (data) => {
            console.log('Student received LOCK command:', data);
            resolve();
        });
        // Note: Generic 'relay_message' on client side unwrap handling is in network-student.ts
        // But here we are using raw socket.io-client, so we typically receive the event directly via the Relay's io.to().emit().
        // My Relay implementation does: io.to(target).emit(event, data).
        // So the client receives 'lock-student' directly.
    });

    console.log('--- Test Passed Successfully ---');
    teacherSocket.disconnect();
    studentSocket.disconnect();
    process.exit(0);
}

testRelay().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});
