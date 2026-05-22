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

app.post('/request', (req, res) => {

    console.log(req.body);

    const {
        room,
        coffee,
        water,
        tea,
        serve_time,
        comment
    } = req.body;

    db.run(

        `
        INSERT INTO requests
        (
            room_name,
            coffee,
            water,
            tea,
            serve_time,
            comment
        )

        VALUES (?, ?, ?, ?, ?, ?)
        `,

        [
            room,
            coffee,
            water,
            tea,
            serve_time,
            comment
        ],

        function(err){

            if(err){

                console.log(err);

                return res.status(500).json({
                    error: err.message
                });

            }

            io.emit('new_request', {

                id: this.lastID,

                room,
                coffee,
                water,
                tea,
                serve_time,
                comment

            });

            res.json({
                success:true
            });

        }

    );

});

io.on('connection', () => {

    console.log('Client Connected');

});

const PORT =
    process.env.PORT || 3000;

server.listen(PORT, () => {

    console.log(
        `Server Running On Port ${PORT}`
    );

});