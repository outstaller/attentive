const dgram = require('dgram');
const os = require('os');

const PORT = 41234;
const MODE = process.argv[2]; // 'server' (sender) or 'client' (receiver)

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

if (MODE === 'server') {
    const socket = dgram.createSocket('udp4');
    const message = Buffer.from(JSON.stringify({ type: 'TEST', from: getLocalIP() }));

    socket.bind(() => {
        socket.setBroadcast(true);
        console.log(`[SERVER] Broadcasting on ${PORT} every 1s...`);

        setInterval(() => {
            const interfaces = os.networkInterfaces();
            let sentCount = 0;
            let ipList = [];

            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name]) {
                    // Skip internal (127.0.0.1) and non-IPv4
                    if (iface.family === 'IPv4' && !iface.internal) {

                        // Calculate Broadcast Address - Fallback to .255 assumption
                        const parts = iface.address.split('.');
                        parts[3] = '255';
                        const broadcastAddr = parts.join('.');

                        const message = Buffer.from(JSON.stringify({
                            type: 'TEST',
                            from: iface.address,
                            iface: name
                        }));

                        socket.send(message, PORT, broadcastAddr, (err) => {
                            if (!err) sentCount++;
                        });

                        // Also try global broadcast 255.255.255.255
                        socket.send(message, PORT, '255.255.255.255', () => { });
                        ipList.push(iface.address);
                    }
                }
            }
            process.stdout.write(`(Sent from ${ipList.join(', ')}) `);
        }, 1000);
    });
} else if (MODE === 'client') {
    const socket = dgram.createSocket('udp4');

    socket.on('message', (msg, rinfo) => {
        console.log(`[CLIENT] Received packet from ${rinfo.address}:${rinfo.port} -> ${msg.toString()}`);
    });

    socket.bind(PORT, () => {
        socket.setBroadcast(true);
        console.log(`[CLIENT] Listening on ${PORT}...`);
    });
} else {
    console.log('Usage: node diagnostic.js [server|client]');
    console.log('Run "server" on Teacher machine, "client" on Student machine.');
}
