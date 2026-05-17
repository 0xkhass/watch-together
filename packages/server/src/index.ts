import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { registerSocketHandlers } from './socket/handlers';

const app = express();
const httpServer = createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const PORT = parseInt(process.env.PORT || '3001', 10);

// ─── Express Middleware ───────────────────────────────────────────────────────

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (_, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── Socket.IO ───────────────────────────────────────────────────────────────

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 20000,
  pingInterval: 10000,
  connectTimeout: 10000,
  maxHttpBufferSize: 1e6, // 1MB
});

io.on('connection', (socket) => {
  registerSocketHandlers(io, socket);
});

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║   Watch Together Server              ║
║   http://localhost:${PORT}              ║
╚══════════════════════════════════════╝
  `);
});

export { io };