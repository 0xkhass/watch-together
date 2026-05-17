import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { roomManager } from '../managers/RoomManager';
import { query } from '../db/client';

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
  MEMBER_JOINED: 'room:member_joined', // Matched to your useRoom.ts hook
  MEMBER_LEFT: 'room:member_left',
  MEMBER_UPDATED: 'room:member_updated',
  HOST_CHANGED: 'room:host_changed',

  // Video sync
  VIDEO_LOAD: 'video:load',
  VIDEO_PLAY: 'video:play',
  VIDEO_PAUSE: 'video:pause',
  VIDEO_SEEK: 'video:seek',
  VIDEO_SYNC: 'video:sync',
  VIDEO_SYNC_REQUEST: 'video:sync:request',
  VIDEO_BUFFERING: 'video:buffering',

  // Chat & Reactions
  CHAT_MESSAGE: 'chat:message',
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

// ─── Register Handlers ────────────────────────────────────────────────────────

export function registerSocketHandlers(io: Server, socket: Socket): void {
  console.log(`[Socket] Connected: ${socket.id}`);

  // ── Ping (latency measurement) ─────────────────────────────────────────────
  socket.on(EVENTS.PING, (ts: number) => {
    socket.emit(EVENTS.PONG, ts);
  });

  // ── Create Room ────────────────────────────────────────────────────────────
  socket.on(EVENTS.ROOM_CREATE, async (data: {
    name?: string;
    username: string;
    userId?: string;
  }, ack: (res: any) => void) => {
    try {
      const userId = data.userId || uuidv4();
      const room = await roomManager.createRoom({
        name: data.name,
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
  }, ack: (res: any) => void) => {
    try {
      const userId = data.userId || uuidv4();
      const result = await roomManager.joinRoom({
        code: data.code,
        userId,
        username: data.username || 'Guest',
        socketId: socket.id,
      });

      if (!result) {
        ack({ success: false, error: 'Room not found' });
        return;
      }

      const { room, member } = result;
      await socket.join(room.id);

      // Send room state to the joiner
      const serialized = roomManager.serializeRoom(room);
      ack({ success: true, room: serialized, userId, member: roomManager.serializeMember(member) });

      // Notify others
      socket.to(room.id).emit(EVENTS.MEMBER_JOINED, {
        member: roomManager.serializeMember(member),
      });

      // Send recent chat history
      const history = await getRecentMessages(room.id);
      if (history.length > 0) {
        socket.emit(EVENTS.CHAT_HISTORY, history);
      }

      console.log(`[Room] ${data.username} joined ${room.code}`);
    } catch (err) {
      console.error('[Room] Join error:', err);
      ack({ success: false, error: 'Failed to join room' });
    }
  });

  // ── Leave / Disconnect ─────────────────────────────────────────────────────
  const handleLeave = () => {
    const { room, member, newHostId } = roomManager.leaveRoom(socket.id);
    if (!room || !member) return;

    socket.to(room.id).emit(EVENTS.MEMBER_LEFT, { userId: member.id });

    if (newHostId) {
      io.to(room.id).emit(EVENTS.HOST_CHANGED, { newHostId });
    }

    // Notify voice peers
    socket.to(room.id).emit(EVENTS.RTC_USER_LEFT_VOICE, { userId: member.id });

    console.log(`[Room] ${member.username} left ${room.code}`);
  };

  socket.on(EVENTS.ROOM_LEAVE, handleLeave);
  socket.on('disconnect', handleLeave);

  // ── Video: Load ────────────────────────────────────────────────────────────
  socket.on(EVENTS.VIDEO_LOAD, (data: {
    roomId: string;
    url: string;
    name: string;
    type: 'url' | 'local';
  }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const member = roomManager.getMemberBySocket(socket.id);
    if (!member?.isHost) return; // Host only

    roomManager.updateVideoState(room.id, {
      url: data.url,
      name: data.name,
      type: data.type,
      currentTime: 0,
      isPlaying: false,
    }, member.id);

    io.to(room.id).emit(EVENTS.VIDEO_LOAD, {
      url: data.url,
      name: data.name,
      type: data.type,
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

  // ── Reactions ──────────────────────────────────────────────────────────────
  socket.on(EVENTS.REACTION, (data: { emoji: string; x: number; y: number }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    const member = roomManager.getMemberBySocket(socket.id);
    if (!room || !member) return;

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