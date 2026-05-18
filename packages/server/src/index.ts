import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { registerSocketHandlers } from './socket/handlers';
import { videoUploadRouter } from './routes/videoUpload';

const app = express();
const httpServer = createServer(app);

/** Origins must match exactly; strip trailing slashes from env (common config mistake). */
function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173,http://192.168.1.10:5173')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

const PORT = parseInt(process.env.PORT || '3001', 10);
const UPLOADS_DIR = path.join(__dirname, '../uploads');

const corsOrigin: cors.CorsOptions['origin'] = (origin, callback) => {
  // Allow requests with no origin (mobile apps, curl, etc.)
  if (!origin) return callback(null, true);

  const normalized = normalizeOrigin(origin);

  // Allow if explicitly listed
  if (allowedOrigins.includes(normalized)) return callback(null, true);

  // In dev: allow any private/local network origin (192.168.x.x, 10.x.x.x, 172.16-31.x.x, localhost)
  if (!process.env.CLIENT_URL) {
    const isPrivate = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(normalized);
    if (isPrivate) return callback(null, true);
  }

  callback(new Error(`CORS: origin ${origin} not allowed`));
};

// ─── Express Middleware ───────────────────────────────────────────────────────

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  next();
});

// Serve uploaded videos so all clients in a room can load the same source
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '1h',
  setHeaders: (res) => {
    res.setHeader('Accept-Ranges', 'bytes');
  },
}));

app.use('/api/video', videoUploadRouter);

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (_, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── Socket.IO ───────────────────────────────────────────────────────────────

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
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

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════╗
║   Watch Together Server              ║
║   http://0.0.0.0:${PORT}              ║
║   (LAN: http://192.168.x.x:${PORT})    ║
╚══════════════════════════════════════╝
  `);
});

export { io };