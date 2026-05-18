import { io, Socket } from 'socket.io-client';

// Auto-detect: if no explicit server URL is set, use the current hostname
// (so LAN devices like http://192.168.1.10:5173 connect to http://192.168.1.10:3001)
function resolveServerUrl(): string {
  const explicit = import.meta.env.VITE_SERVER_URL;
  if (explicit) return explicit;
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return `http://${host}:3001`;
}

export const SERVER_URL = resolveServerUrl();

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      // Polling first helps when the API is waking from sleep (e.g. Render free tier)
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: false,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket!.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}

/** Wait until the socket is connected (or timeout). Used before room create/join. */
export function waitForSocketConnection(
  sock: Socket = getSocket(),
  timeoutMs = 25000,
): Promise<void> {
  if (sock.connected) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Could not connect to server. Try again in a moment.'));
    }, timeoutMs);

    const onConnect = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timer);
      sock.off('connect', onConnect);
    };

    sock.on('connect', onConnect);
    connectSocket();
  });
}