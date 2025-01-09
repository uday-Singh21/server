const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(bodyParser.json());
app.use(cors());

const storage = require('node-persist');

storage.init()

const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
    transports: ['websocket']
});

const PORT = 3000;

const createdRooms = [];

const generateID = () => Math.random().toString(36).substring(2, 10)
const getNowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const generateRoomCode = (min = 100000, max = 999999) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

io.on('connection', async (socket) => {
    console.log("Client connected:", socket.id);

    // await storage.clear()

    await getPersistedRoom();
    console.log('Created rooms', createdRooms)

    createRoom(socket);

    joinRoom(socket);

    sendMessage(socket);

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});

app.get('/health', (req, res) => {
    res.status(200).send({ status: 'ok' });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const createRoom = (socket) => {
    socket.on("createRoom", async (roomName, userID) => {
        try {
            const room = {
                id: generateID(),
                roomName,
                messages: [{
                    id: generateID(),
                    text: `Room "${roomName}" was created by ${userID}`,
                    sender: 'system',
                    timestamp: getNowTime()
                }],
                roomCode: generateRoomCode(),
                createdBy: userID,
                createdAt: getNowTime(),
                users: [userID]
            };

            socket.join(room.id)
            socket.emit("roomCreated", room);
            console.log('Room created:', room);

            createdRooms.unshift(room)
            setPeristedRoom(createdRooms);

        } catch (error) {
            console.error('Error creating room:', error);
            socket.emit('error', 'Failed to create room');
        }
    });
}

const joinRoom = (socket) => {
    socket.on("joinRoom", async (roomCode, userID) => {
        try {
            const room = createdRooms.find((r) => r.roomCode == roomCode);

            if (room) {
                const isUserAlreadyInRoom = room.users.includes(userID);

                socket.join(room.id);

                if (!isUserAlreadyInRoom) {
                    room.users.push(userID);

                    const joinMessage = {
                        id: generateID(),
                        text: `${userID} joined the room`,
                        sender: 'system',
                        timestamp: getNowTime()
                    };
                    room.messages.push(joinMessage);

                    socket.to(room.id).emit("userJoined", { userId: userID });
                    console.log(`User ${userID} joined room:`, room);
                }

                socket.emit("roomJoined", room);
            } else {
                socket.emit("error", "Room not found");
            }
        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', 'Failed to join room');
        }
    });
};

const sendMessage = (socket) => {
    socket.on("sendMessage", async (roomId, msg, userId) => {
        try {
            const room = createdRooms.find(r => r.id === roomId);

            if (!room) {
                socket.emit('error', 'Room not found');
                return;
            }

            const message = {
                id: generateID(),
                text: msg,
                sender: userId,
                timestamp: getNowTime()
            };

            room.messages.push(message);

            io.to(room.id).emit("newMessage", message);

            setPeristedRoom(createdRooms);

            console.log(`Message sent in room ${room.roomName}:`, message);

        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('error', 'Failed to send message');
        }
    });
};

const setPeristedRoom = async (roomArr) => {
    try {
        await storage.setItem('RoomName', JSON.stringify(roomArr))
        console.log('Persisted room', roomArr)
    } catch (error) {
        console.log('Error peristing room', error)
    }
}

const getPersistedRoom = async () => {
    try {
        const response = await storage.getItem('RoomName');
        const persistedRooms = response ? JSON.parse(response) : [];

        createdRooms.splice(0, createdRooms.length, ...persistedRooms);

        // console.log('Response from storage:', persistedRooms);
    } catch (error) {
        console.log('Error in getting persisted room', error);
    }
};
