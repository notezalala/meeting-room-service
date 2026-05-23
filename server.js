const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ================= MIDDLEWARE =================
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

// ================= DATABASE =================
const db = new sqlite3.Database('./meeting.db', (err) => {
    if (err) console.log(err);
    else console.log("SQLite Connected");
});

// 🔥 FIX: เพิ่ม queue_number ใน table
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_name TEXT,
            customer_name TEXT,
            coffee INTEGER,
            water INTEGER,
            tea INTEGER,
            serve_time TEXT,
            comment TEXT,
            status TEXT DEFAULT 'PENDING',
            queue_number INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// ================= DAILY QUEUE =================
function getQueueNumber(callback){

    db.get(`
        SELECT MAX(queue_number) as maxQueue
        FROM requests
        WHERE date(created_at,'localtime') = date('now','localtime')
    `, [], (err,row)=>{

        if(err){
            callback(1);
            return;
        }

        const nextQueue = (row?.maxQueue || 0) + 1;
        callback(nextQueue);
    });
}

// ================= POST ORDER =================
app.post('/request', (req, res) => {

    const {
        room,
        coffee,
        water,
        tea,
        serve_time,
        comment,
        customer_name
    } = req.body;

    getQueueNumber((queue_number)=>{

        db.run(`
            INSERT INTO requests
            (
                room_name,
                coffee,
                water,
                tea,
                serve_time,
                comment,
                status,
                customer_name,
                queue_number
            )
            VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `,
        [
            room,
            coffee,
            water,
            tea,
            serve_time,
            comment,
            customer_name,
            queue_number
        ],
        function(err){

            if(err){
                console.log(err);
                return res.status(500).json({error:err.message});
            }

            io.emit('new_request',{
                id:this.lastID,
                room_name:room,
                coffee,
                water,
                tea,
                serve_time,
                comment,
                customer_name,
                queue_number,
                status:'PENDING'
            });

            res.json({success:true});
        });

    });

});

// ================= SOCKET.IO =================
io.on('connection', (socket) => {

    console.log("Client connected");

    // ================= LOAD ALL =================
    socket.on('get_all_requests', () => {

        db.all(`
            SELECT *
            FROM requests
            ORDER BY id DESC
        `, [], (err, rows) => {

            if (err) {
                console.log("DB ERROR:", err);
                return;
            }

            socket.emit('all_requests', rows);
        });
    });

    // ================= UPDATE STATUS =================
    socket.on('update_status', (data) => {

        const { id, status } = data;

        if (status === 'done') {

            db.run(`DELETE FROM requests WHERE id = ?`, [id], () => {
                io.emit('remove_request', { id });
            });

        } else {

            db.run(
                `UPDATE requests SET status = ? WHERE id = ?`,
                [status, id],
                () => {
                    io.emit('status_updated', { id, status });
                }
            );
        }
    });

});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on ${PORT}`);
});