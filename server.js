const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
const path = require('path');

// =========================
// FIX ROUTE (สำคัญสำหรับ Render)
// =========================

app.get('/order.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// =========================
// fallback กันหลุด (ต้องอยู่ล่างสุด)
// =========================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// =========================
// SQLite DB
// =========================
const db = new sqlite3.Database('./meeting.db', (err) => {
    if (err) {
        console.log(err);
    } else {
        console.log("SQLite Connected");
    }
});

// =========================
// Create Table
// =========================
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_name TEXT,
            coffee INTEGER,
            water INTEGER,
            tea INTEGER,
            serve_time TEXT,
            comment TEXT,
            status TEXT DEFAULT 'PENDING',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// =========================
// POST NEW REQUEST
// =========================
app.post('/request', (req, res) => {

    const { room, coffee, water, tea, serve_time, comment } = req.body;

    db.run(`
        INSERT INTO requests
        (
            room_name,
            coffee,
            water,
            tea,
            serve_time,
            comment,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    `,
    [room, coffee, water, tea, serve_time, comment],
    function (err) {

        if (err) {
            console.log(err);
            return res.status(500).json({ error: err.message });
        }

        const newData = {
            id: this.lastID,
            room,
            coffee,
            water,
            tea,
            serve_time,
            comment,
            status: 'PENDING'
        };

        io.emit('new_request', newData);

        res.json({ success: true });

    });

});

// =========================
// GET ALL REQUESTS (REST API)
// =========================
app.get('/requests', (req, res) => {

    db.all(`
        SELECT *
        FROM requests
        ORDER BY created_at DESC
    `, [], (err, rows) => {

        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(rows);

    });

});

// =========================
// SOCKET IO
// =========================
io.on('connection', (socket) => {

    console.log('Client Connected');

    // ส่งข้อมูลทั้งหมดตอนโหลดหน้า
    socket.on('get_all_requests', () => {

        db.all(`
            SELECT *
            FROM requests
            ORDER BY created_at DESC
        `, [], (err, rows) => {

            if (!err) {
                socket.emit('all_requests', rows);
            }

        });

    });

});

// =========================
// CLEAR AT MIDNIGHT
// =========================
function clearAtMidnight() {

    const now = new Date();
    const next = new Date();
    next.setHours(24, 0, 0, 0);

    const ms = next - now;

    setTimeout(() => {

        db.run(`DELETE FROM requests`, [], (err) => {
            if (!err) {
                console.log("Cleared all requests at midnight");
                io.emit('clear_all');
            }
        });

        clearAtMidnight();

    }, ms);

}

clearAtMidnight();

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server Running On Port ${PORT}`);
});