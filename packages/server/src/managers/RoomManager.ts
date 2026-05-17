import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VideoState {
  url: string | null;
  name: string | null;
  type: 'url' | 'local';
  currentTime: number;
  isPlaying: boolean;
  lastUpdateAt: number; // epoch ms
  updatedBy: string;
}

export interface Member {
  id: string;
  username: string;
  avatarColor: string;
  isHost: boolean;
  socketId: string;
  joinedAt: number;
  isMuted: boolean;
  isDeafened: boolean;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  hostId: string;
  members: Map<string, Member>;
  video: VideoState;
  createdAt: number;
  expiresAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f43f5e', '#84cc16', '#6366f1',
];

export function randomAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

// ─── RoomManager ─────────────────────────────────────────────────────────────

class RoomManager {
  private rooms = new Map<string, Room>();         // by id
  private codeIndex = new Map<string, string>();   // code → id
  private socketIndex = new Map<string, string>(); // socketId → roomId

  // ── Create ──────────────────────────────────────────────────────────────────

  async createRoom(opts: {
    name?: string;
    hostId: string;
    hostUsername: string;
    hostSocketId: string;
  }): Promise<Room> {
    // Generate a unique code
    let code = generateCode();
    while (this.codeIndex.has(code)) {
      code = generateCode();
    }

    const room: Room = {
      id: uuidv4(),
      code,
      name: opts.name || `${opts.hostUsername}'s Room`,
      hostId: opts.hostId,
      members: new Map(),
      video: {
        url: null,
        name: null,
        type: 'url',
        currentTime: 0,
        isPlaying: false,
        lastUpdateAt: Date.now(),
        updatedBy: opts.hostId,
      },
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };

    const host: Member = {
      id: opts.hostId,
      username: opts.hostUsername,
      avatarColor: randomAvatarColor(),
      isHost: true,
      socketId: opts.hostSocketId,
      joinedAt: Date.now(),
      isMuted: false,
      isDeafened: false,
    };

    room.members.set(opts.hostId, host);
    this.rooms.set(room.id, room);
    this.codeIndex.set(code, room.id);
    this.socketIndex.set(opts.hostSocketId, room.id);

    // Persist to DB (fire and forget)
    this.persistRoom(room).catch(console.error);

    return room;
  }

  // ── Join ────────────────────────────────────────────────────────────────────

  async joinRoom(opts: {
    code: string;
    userId: string;
    username: string;
    socketId: string;
  }): Promise<{ room: Room; member: Member } | null> {
    const roomId = this.codeIndex.get(opts.code.toUpperCase());
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    // If user already in room (reconnect), update socket
    const existing = room.members.get(opts.userId);
    if (existing) {
      if (existing.socketId) this.socketIndex.delete(existing.socketId);
      existing.socketId = opts.socketId;
      this.socketIndex.set(opts.socketId, roomId);
      return { room, member: existing };
    }

    const member: Member = {
      id: opts.userId,
      username: opts.username,
      avatarColor: randomAvatarColor(),
      isHost: false,
      socketId: opts.socketId,
      joinedAt: Date.now(),
      isMuted: false,
      isDeafened: false,
    };

    room.members.set(opts.userId, member);
    this.socketIndex.set(opts.socketId, roomId);

    return { room, member };
  }

  // ── Leave ───────────────────────────────────────────────────────────────────

  leaveRoom(socketId: string): {
    room: Room | null;
    member: Member | null;
    newHostId: string | null;
  } {
    const roomId = this.socketIndex.get(socketId);
    if (!roomId) return { room: null, member: null, newHostId: null };

    this.socketIndex.delete(socketId);

    const room = this.rooms.get(roomId);
    if (!room) return { room: null, member: null, newHostId: null };

    // Find member by socketId
    let leftMember: Member | null = null;
    for (const m of room.members.values()) {
      if (m.socketId === socketId) {
        leftMember = m;
        break;
      }
    }

    if (!leftMember) return { room, member: null, newHostId: null };

    room.members.delete(leftMember.id);

    // If room empty, schedule cleanup
    if (room.members.size === 0) {
      setTimeout(() => this.cleanupRoom(room.id), 60_000);
      return { room, member: leftMember, newHostId: null };
    }

    // Transfer host if needed
    let newHostId: string | null = null;
    if (leftMember.isHost) {
      const nextMember = room.members.values().next().value as Member;
      nextMember.isHost = true;
      room.hostId = nextMember.id;
      newHostId = nextMember.id;
    }

    return { room, member: leftMember, newHostId };
  }

  // ── Video State ─────────────────────────────────────────────────────────────

  updateVideoState(
    roomId: string,
    updates: Partial<VideoState>,
    updatedBy: string
  ): VideoState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    Object.assign(room.video, updates, {
      lastUpdateAt: Date.now(),
      updatedBy,
    });

    return room.video;
  }

  // ── Getters ─────────────────────────────────────────────────────────────────

  getRoomById(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  getRoomByCode(code: string): Room | undefined {
    const id = this.codeIndex.get(code.toUpperCase());
    return id ? this.rooms.get(id) : undefined;
  }

  getRoomBySocket(socketId: string): Room | undefined {
    const id = this.socketIndex.get(socketId);
    return id ? this.rooms.get(id) : undefined;
  }

  getMemberBySocket(socketId: string): Member | undefined {
    const room = this.getRoomBySocket(socketId);
    if (!room) return undefined;
    for (const m of room.members.values()) {
      if (m.socketId === socketId) return m;
    }
    return undefined;
  }

  updateMember(roomId: string, userId: string, updates: Partial<Member>): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const member = room.members.get(userId);
    if (!member) return;
    Object.assign(member, updates);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  private cleanupRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room || room.members.size > 0) return;
    this.codeIndex.delete(room.code);
    this.rooms.delete(roomId);
    console.log(`[Room] Cleaned up empty room ${room.code}`);
  }

  // ── Persistence ──────────────────────────────────────────────────────────────

  private async persistRoom(room: Room): Promise<void> {
    try {
      await query(
        `INSERT INTO rooms (id, code, name, host_id, video_url, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, to_timestamp($6/1000.0), to_timestamp($7/1000.0))
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [room.id, room.code, room.name, room.hostId, room.video.url, room.createdAt, room.expiresAt]
      );
    } catch (_) {
      // DB unavailable — in-memory only is fine
    }
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  serializeRoom(room: Room) {
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      hostId: room.hostId,
      members: Array.from(room.members.values()).map(this.serializeMember),
      video: room.video,
      createdAt: room.createdAt,
    };
  }

  serializeMember(member: Member) {
    return {
      id: member.id,
      username: member.username,
      avatarColor: member.avatarColor,
      isHost: member.isHost,
      joinedAt: member.joinedAt,
      isMuted: member.isMuted,
      isDeafened: member.isDeafened,
    };
  }
}

export const roomManager = new RoomManager();