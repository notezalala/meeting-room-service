const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ================= ROUTES =================
app.get('/order.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ================= DB =================
const db = new sqlite3.Database('./meeting.db');

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

// ================= CREATE =================
app.post('/request', (req, res) => {

    const { room, coffee, water, tea, serve_time, comment } = req.body;

    db.run(`
        INSERT INTO requests
        (room_name, coffee, water, tea, serve_time, comment, status)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    `,
    [room || 'UNKNOWN', coffee, water, tea, serve_time, comment],
    function (err) {

        if (err) return res.status(500).json({ error: err.message });

        const data = {
            id: this.lastID,
            room_name: room || 'UNKNOWN',
            coffee,
            water,
            tea,
            serve_time,
            comment,
            status: 'PENDING'
        };

        io.emit('new_request', data);

        res.json({ success: true });

    });

});

// ================= GET ALL =================
app.get('/requests', (req, res) => {

    db.all(`
        SELECT *
        FROM requests
        ORDER BY id DESC
    `, [], (err, rows) => {

        if (err) return res.status(500).json({ error: err.message });

        res.json(rows);

    });

});

// ================= SOCKET =================
io.on('connection', (socket) => {

    socket.on('get_all_requests', () => {

        db.all(`
            SELECT *
            FROM requests
            ORDER BY id DESC
        `, [], (err, rows) => {

            if (!err) socket.emit('all_requests', rows);

        });

    });

    // 🔥 FIX: update status ต้อง broadcast + confirm
    socket.on('update_status', ({ id, status }) => {

        db.run(`
            UPDATE requests
            SET status = ?
            WHERE id = ?
        `, [status, id], function (err) {

            if (err) return;

            // ส่งกลับ “ตัวอัปเดตจริง”
            io.emit('status_updated', {
                id,
                status
            });

        });

    });

});

server.listen(3000, () => {
    console.log("Server running");
});