import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { roomManager } from '../managers/RoomManager';
import { query } from '../db/client';
import { isNonShareableVideoUrl, summarizeVideoUrl } from '../utils/videoUrl';

// ─── Event Types (shared with client) ────────────────────────────────────────

// ─── WebRTC Types for Node.js (Relay Only) ───────────────────────────────────
export interface RTCSessionDescriptionInit {
  type: 'offer' | 'pranswer' | 'answer' | 'rollback';
  sdp?: string;
}

export interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export const EVENTS = {
  // Room lifecycle
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_STATE: 'room:state',
  ROOM_ERROR: 'room:error',

  // Members
  MEMBER_JOINED: 'room:member_joined',
  MEMBER_LEFT: 'room:member_left',
  MEMBER_UPDATED: 'room:member_updated',
  MEMBER_RECONNECTED: 'room:member_reconnected',
  HOST_CHANGED: 'room:host_changed',

  // Video sync
  VIDEO_LOAD: 'video:load',
  VIDEO_PLAY: 'video:play',
  VIDEO_PAUSE: 'video:pause',
  VIDEO_SEEK: 'video:seek',
  VIDEO_SYNC: 'video:sync',
  VIDEO_SYNC_REQUEST: 'video:sync:request',
  VIDEO_BUFFERING: 'video:buffering',
  VIDEO_ERROR: 'video:error',

  // Chat & Reactions
  CHAT_MESSAGE: 'chat:message',
  CHAT_TYPING: 'chat:typing',
  CHAT_HISTORY: 'chat:history',
  REACTION: 'room:reaction',

  // WebRTC signaling
  RTC_OFFER: 'rtc:offer',
  RTC_ANSWER: 'rtc:answer',
  RTC_ICE: 'rtc:ice',
  RTC_USER_JOINED_VOICE: 'rtc:user_joined_voice',
  RTC_USER_LEFT_VOICE: 'rtc:user_left_voice',

  // Ping/latency
  PING: 'ping',
  PONG: 'pong',
} as const;

// ─── Per-Socket Rate Limiter ──────────────────────────────────────────────────

class RateLimiter {
  private buckets = new Map<string, number[]>();

  /** Returns true if the action is allowed. */
  allow(key: string, maxPerWindow: number, windowMs: number): boolean {
    const now = Date.now();
    let timestamps = this.buckets.get(key);
    if (!timestamps) {
      timestamps = [];
      this.buckets.set(key, timestamps);
    }
    // Remove expired timestamps
    while (timestamps.length > 0 && timestamps[0] < now - windowMs) {
      timestamps.shift();
    }
    if (timestamps.length >= maxPerWindow) return false;
    timestamps.push(now);
    return true;
  }

  clear(key: string) {
    this.buckets.delete(key);
  }
}

const rateLimiter = new RateLimiter();

// ─── Register Handlers ────────────────────────────────────────────────────────

export function registerSocketHandlers(io: Server, socket: Socket): void {
  console.log(`[Socket] Connected: ${socket.id}`);

  // ── Ping (latency measurement) ─────────────────────────────────────────────
  socket.on(EVENTS.PING, (ts: number) => {
    socket.emit(EVENTS.PONG, ts);
  });

  socket.on(EVENTS.ROOM_CREATE, async (data: {
    name?: string;
    password?: string;
    username: string;
    userId?: string;
  }, ack: (res: any) => void) => {
    try {
      const userId = data.userId || uuidv4();
      const room = await roomManager.createRoom({
        name: data.name,
        password: data.password || undefined,
        hostId: userId,
        hostUsername: data.username || 'Host',
        hostSocketId: socket.id,
      });

      await socket.join(room.id);

      const serialized = roomManager.serializeRoom(room);
      ack({ success: true, room: serialized, userId });
      console.log(`[Room] Created ${room.code} by ${data.username}`);
    } catch (err) {
      console.error('[Room] Create error:', err);
      ack({ success: false, error: 'Failed to create room' });
    }
  });

  // ── Join Room ──────────────────────────────────────────────────────────────
  socket.on(EVENTS.ROOM_JOIN, async (data: {
    code: string;
    username: string;
    userId?: string;
    password?: string;
  }, ack: (res: any) => void) => {
    try {
      const userId = data.userId || uuidv4();
      const result = await roomManager.joinRoom({
        code: data.code,
        userId,
        username: data.username || 'Guest',
        socketId: socket.id,
        password: data.password,
      });

      if ('error' in result) {
        ack({ success: false, error: result.error });
        return;
      }

      const { room, member, isReconnect } = result;
      await socket.join(room.id);

      const serializedMember = roomManager.serializeMember(member);

      // Send room state to the joiner
      const serialized = roomManager.serializeRoom(room);
      ack({
        success: true,
        room: serialized,
        userId,
        member: serializedMember,
        isReconnect,
      });

      // Notify others (join vs reconnect)
      const memberPayload = { member: serializedMember };
      if (isReconnect) {
        socket.to(room.id).emit(EVENTS.MEMBER_RECONNECTED, memberPayload);
        console.log(`[Room] ${data.username} reconnected to ${room.code}`);
      } else {
        socket.to(room.id).emit(EVENTS.MEMBER_JOINED, memberPayload);
        console.log(`[Room] ${data.username} joined ${room.code}`);
      }

      // Send recent chat history
      const history = await getRecentMessages(room.id);
      if (history.length > 0) {
        socket.emit(EVENTS.CHAT_HISTORY, history);
      }
    } catch (err) {
      console.error('[Room] Join error:', err);
      ack({ success: false, error: 'Failed to join room' });
    }
  });

  // ── Leave / Disconnect ─────────────────────────────────────────────────────

  /** Intentional leave (user clicks Leave button). */
  const handleIntentionalLeave = () => {
    const { room, member } = roomManager.leaveRoom(socket.id);
    if (!room || !member) return;

    rateLimiter.clear(`chat:${socket.id}`);
    rateLimiter.clear(`reaction:${socket.id}`);

    // For intentional leave, force-remove immediately (no grace period)
    room.members.delete(member.id);
    
    socket.to(room.id).emit(EVENTS.MEMBER_LEFT, { userId: member.id });
    socket.to(room.id).emit(EVENTS.RTC_USER_LEFT_VOICE, { userId: member.id });

    // Transfer host if needed
    if (member.isHost && room.members.size > 0) {
      for (const m of room.members.values()) {
        if (m.disconnectedAt === null) {
          m.isHost = true;
          room.hostId = m.id;
          io.to(room.id).emit(EVENTS.HOST_CHANGED, {
            newHostId: m.id,
            newHostUsername: m.username,
          });
          break;
        }
      }
    }

    console.log(`[Room] ${member.username} left ${room.code}`);
  };

  /** Socket disconnect (refresh, network drop, tab close). Uses grace period. */
  const handleDisconnect = () => {
    const { room, member, isGracePeriod } = roomManager.leaveRoom(socket.id);
    if (!room || !member) return;

    rateLimiter.clear(`chat:${socket.id}`);
    rateLimiter.clear(`reaction:${socket.id}`);

    if (isGracePeriod) {
      // Don't notify others of a full leave — they might be refreshing
      console.log(`[Room] ${member.username} disconnected from ${room.code} (grace period started)`);
    } else {
      socket.to(room.id).emit(EVENTS.MEMBER_LEFT, { userId: member.id });
      socket.to(room.id).emit(EVENTS.RTC_USER_LEFT_VOICE, { userId: member.id });
      console.log(`[Room] ${member.username} left ${room.code}`);
    }
  };

  socket.on(EVENTS.ROOM_LEAVE, handleIntentionalLeave);
  socket.on('disconnect', handleDisconnect);

  // ── Video: Load ────────────────────────────────────────────────────────────
  socket.on(EVENTS.VIDEO_LOAD, (data: {
    url: string;
    name: string;
    type: 'url' | 'local';
    provider?: string;
    embedId?: string;
    embedUrl?: string;
  }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) {
      console.warn('[Video] load ignored — socket not in a room', { socketId: socket.id });
      return;
    }

    const member = roomManager.getMemberBySocket(socket.id);
    if (!member?.isHost) {
      console.warn('[Video] load rejected — not host', {
        roomCode: room.code,
        userId: member?.id,
        hostId: room.hostId,
      });
      return;
    }

    if (!data.url?.trim()) {
      console.warn('[Video] load rejected — empty url', { roomCode: room.code });
      return;
    }

    if (isNonShareableVideoUrl(data.url)) {
      console.error('[Video] load rejected — non-shareable URL (blob/local)', {
        roomCode: room.code,
        url: summarizeVideoUrl(data.url),
        type: data.type,
        hint: 'Upload the file via POST /api/video/upload so all clients get an HTTP URL',
      });
      socket.emit(EVENTS.VIDEO_ERROR, {
        error: 'Local blob URLs cannot be shared. Upload the file to the server instead.',
      });
      return;
    }

    const videoType = data.type === 'local' ? 'url' : data.type;

    console.log('[Video] load', {
      roomCode: room.code,
      host: member.username,
      name: data.name,
      type: videoType,
      url: summarizeVideoUrl(data.url),
      memberCount: room.members.size,
    });

    roomManager.updateVideoState(room.id, {
      url: data.url,
      name: data.name,
      type: videoType,
      provider: data.provider,
      embedId: data.embedId,
      embedUrl: data.embedUrl,
      currentTime: 0,
      isPlaying: false,
    }, member.id);

    const payload = {
      url: data.url,
      name: data.name,
      type: videoType,
      provider: data.provider,
      embedId: data.embedId,
      embedUrl: data.embedUrl,
    };
    io.to(room.id).emit(EVENTS.VIDEO_LOAD, payload);
    console.log('[Video] broadcast video:load to room', {
      roomCode: room.code,
      roomId: room.id,
      recipients: room.members.size,
    });
  });

  // ── Video: Play ────────────────────────────────────────────────────────────
  socket.on(EVENTS.VIDEO_PLAY, (data: { currentTime: number }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    const member = roomManager.getMemberBySocket(socket.id);
    if (!room || !member?.isHost) return;

    roomManager.updateVideoState(room.id, {
      isPlaying: true,
      currentTime: data.currentTime,
    }, member.id);

    socket.to(room.id).emit(EVENTS.VIDEO_PLAY, {
      currentTime: data.currentTime,
      serverTime: Date.now(),
    });
  });

  // ── Video: Pause ───────────────────────────────────────────────────────────
  socket.on(EVENTS.VIDEO_PAUSE, (data: { currentTime: number }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    const member = roomManager.getMemberBySocket(socket.id);
    if (!room || !member?.isHost) return;

    roomManager.updateVideoState(room.id, {
      isPlaying: false,
      currentTime: data.currentTime,
    }, member.id);

    socket.to(room.id).emit(EVENTS.VIDEO_PAUSE, {
      currentTime: data.currentTime,
      serverTime: Date.now(),
    });
  });

  // ── Video: Seek ────────────────────────────────────────────────────────────
  socket.on(EVENTS.VIDEO_SEEK, (data: { currentTime: number }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    const member = roomManager.getMemberBySocket(socket.id);
    if (!room || !member?.isHost) return;

    roomManager.updateVideoState(room.id, {
      currentTime: data.currentTime,
    }, member.id);

    socket.to(room.id).emit(EVENTS.VIDEO_SEEK, {
      currentTime: data.currentTime,
      serverTime: Date.now(),
    });
  });

  // ── Video: Sync Request (guests poll for authoritative state) ──────────────
  socket.on(EVENTS.VIDEO_SYNC_REQUEST, () => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const { video } = room;
    // Compute live currentTime if playing
    const elapsed = video.isPlaying
      ? (Date.now() - video.lastUpdateAt) / 1000
      : 0;

    socket.emit(EVENTS.VIDEO_SYNC, {
      currentTime: video.currentTime + elapsed,
      isPlaying: video.isPlaying,
      serverTime: Date.now(),
      url: video.url,
      name: video.name,
      type: video.type,
      provider: video.provider,
      embedId: video.embedId,
      embedUrl: video.embedUrl,
    });
  });

  // ── Video: Buffering ───────────────────────────────────────────────────────
  socket.on(EVENTS.VIDEO_BUFFERING, (data: { isBuffering: boolean }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    const member = roomManager.getMemberBySocket(socket.id);
    if (!room || !member) return;

    socket.to(room.id).emit(EVENTS.VIDEO_BUFFERING, {
      userId: member.id,
      username: member.username,
      isBuffering: data.isBuffering,
    });
  });

  // ── Chat ───────────────────────────────────────────────────────────────────
  socket.on(EVENTS.CHAT_MESSAGE, async (data: { content: string }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    const member = roomManager.getMemberBySocket(socket.id);
    if (!room || !member) return;

    // Rate limit: 10 messages per 5 seconds
    if (!rateLimiter.allow(`chat:${socket.id}`, 10, 5000)) return;

    const content = data.content?.trim().slice(0, 500);
    if (!content) return;

    const message = {
      id: uuidv4(),
      userId: member.id,
      username: member.username,
      avatarColor: member.avatarColor,
      content,
      type: 'text' as const,
      createdAt: Date.now(),
    };

    // Broadcast to all including sender
    io.to(room.id).emit(EVENTS.CHAT_MESSAGE, message);

    // Persist async to Supabase DB
    persistMessage(room.id, message).catch(console.error);
  });

  socket.on(EVENTS.CHAT_TYPING, () => {
    const room = roomManager.getRoomBySocket(socket.id);
    const member = roomManager.getMemberBySocket(socket.id);
    if (!room || !member) return;
    socket.to(room.id).emit(EVENTS.CHAT_TYPING, {
      userId: member.id,
      username: member.username,
    });
  });

  // ── Reactions ──────────────────────────────────────────────────────────────
  socket.on(EVENTS.REACTION, (data: { emoji: string; x: number; y: number }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    const member = roomManager.getMemberBySocket(socket.id);
    if (!room || !member) return;

    // Rate limit: 5 reactions per 3 seconds
    if (!rateLimiter.allow(`reaction:${socket.id}`, 5, 3000)) return;

    io.to(room.id).emit(EVENTS.REACTION, {
      id: uuidv4(),
      userId: member.id,
      username: member.username,
      emoji: data.emoji,
      x: data.x ?? 0.5,
      y: data.y ?? 0.8,
      createdAt: Date.now(),
    });
  });

  // ── WebRTC Signaling ───────────────────────────────────────────────────────

  // User enables voice
  socket.on(EVENTS.RTC_USER_JOINED_VOICE, () => {
    const room = roomManager.getRoomBySocket(socket.id);
    const member = roomManager.getMemberBySocket(socket.id);
    if (!room || !member) return;

    // Notify all other voice participants
    socket.to(room.id).emit(EVENTS.RTC_USER_JOINED_VOICE, {
      userId: member.id,
      username: member.username,
    });
  });

  // Relay WebRTC offer
  socket.on(EVENTS.RTC_OFFER, (data: { targetUserId: string; offer: RTCSessionDescriptionInit }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    const member = roomManager.getMemberBySocket(socket.id);
    if (!room || !member) return;

    const target = Array.from(room.members.values()).find(m => m.id === data.targetUserId);
    if (!target?.socketId) return;

    io.to(target.socketId).emit(EVENTS.RTC_OFFER, {
      fromUserId: member.id,
      offer: data.offer,
    });
  });

  // Relay WebRTC answer
  socket.on(EVENTS.RTC_ANSWER, (data: { targetUserId: string; answer: RTCSessionDescriptionInit }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    const member = roomManager.getMemberBySocket(socket.id);
    if (!room || !member) return;

    const target = Array.from(room.members.values()).find(m => m.id === data.targetUserId);
    if (!target?.socketId) return;

    io.to(target.socketId).emit(EVENTS.RTC_ANSWER, {
      fromUserId: member.id,
      answer: data.answer,
    });
  });

  // Relay ICE candidate
  socket.on(EVENTS.RTC_ICE, (data: { targetUserId: string; candidate: RTCIceCandidateInit }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    const member = roomManager.getMemberBySocket(socket.id);
    if (!room || !member) return;

    const target = Array.from(room.members.values()).find(m => m.id === data.targetUserId);
    if (!target?.socketId) return;

    io.to(target.socketId).emit(EVENTS.RTC_ICE, {
      fromUserId: member.id,
      candidate: data.candidate,
    });
  });

  // Member mute update
  socket.on(EVENTS.MEMBER_UPDATED, (data: { isMuted?: boolean; isDeafened?: boolean }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    const member = roomManager.getMemberBySocket(socket.id);
    if (!room || !member) return;

    roomManager.updateMember(room.id, member.id, data);
    socket.to(room.id).emit(EVENTS.MEMBER_UPDATED, {
      userId: member.id,
      ...data,
    });
  });
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

async function persistMessage(roomId: string, msg: {
  id: string;
  userId: string;
  username: string;
  avatarColor: string;
  content: string;
  type: string;
}): Promise<void> {
  await query(
    `INSERT INTO messages (id, room_id, user_id, username, avatar_color, content, type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [msg.id, roomId, msg.userId, msg.username, msg.avatarColor, msg.content, msg.type]
  );
}

async function getRecentMessages(roomId: string): Promise<any[]> {
  return query(
    `SELECT id, user_id as "userId", username, avatar_color as "avatarColor",
            content, type, EXTRACT(EPOCH FROM created_at)*1000 as "createdAt"
     FROM messages WHERE room_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [roomId]
  ).then(rows => rows.reverse());
}