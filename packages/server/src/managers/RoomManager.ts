import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { query } from '../db/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VideoState {
  url: string | null;
  name: string | null;
  type: 'url' | 'local';
  provider?: string;
  embedId?: string;
  embedUrl?: string;
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
  /** Set when socket disconnects; cleared on reconnect. null = connected. */
  disconnectedAt: number | null;
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
  /** SHA-256 hash of room password. null = open room. */
  passwordHash: string | null;
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

const MAX_MEMBERS_PER_ROOM = 20;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const RECONNECT_GRACE_MS = 15_000; // 15 seconds grace period for page refresh

// ─── RoomManager ─────────────────────────────────────────────────────────────

class RoomManager {
  private rooms = new Map<string, Room>();         // by id
  private codeIndex = new Map<string, string>();   // code → id
  private socketIndex = new Map<string, string>(); // socketId → roomId
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Periodically clean up expired rooms
    this.cleanupTimer = setInterval(() => this.cleanupExpiredRooms(), CLEANUP_INTERVAL_MS);
  }

  private cleanupExpiredRooms(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, room] of this.rooms) {
      if (now > room.expiresAt || (room.members.size === 0 && now - room.createdAt > 60_000)) {
        this.codeIndex.delete(room.code);
        for (const m of room.members.values()) {
          this.socketIndex.delete(m.socketId);
        }
        this.rooms.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) console.log(`[RoomManager] Cleaned up ${cleaned} expired room(s). Active: ${this.rooms.size}`);
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  async createRoom(opts: {
    name?: string;
    password?: string;
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
      passwordHash: opts.password
        ? createHash('sha256').update(opts.password).digest('hex')
        : null,
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
      disconnectedAt: null,
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
    password?: string;
  }): Promise<{ room: Room; member: Member; isReconnect: boolean } | { error: string }> {
    const roomId = this.codeIndex.get(opts.code.toUpperCase());
    if (!roomId) return { error: 'Room not found' };

    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Room not found' };

    // Password check (skip for reconnecting members)
    const existing = room.members.get(opts.userId);
    if (!existing && room.passwordHash) {
      if (!opts.password) return { error: 'password_required' };
      const hash = createHash('sha256').update(opts.password).digest('hex');
      if (hash !== room.passwordHash) return { error: 'Incorrect password' };
    }

    // If user already in room (reconnect), update socket
    if (existing) {
      if (existing.socketId) this.socketIndex.delete(existing.socketId);
      existing.socketId = opts.socketId;
      existing.username = opts.username;
      existing.disconnectedAt = null; // Clear disconnect flag
      this.socketIndex.set(opts.socketId, roomId);
      return { room, member: existing, isReconnect: true };
    }

    // Enforce max members
    if (room.members.size >= MAX_MEMBERS_PER_ROOM) {
      return { error: 'Room is full' };
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
      disconnectedAt: null,
    };

    room.members.set(opts.userId, member);
    this.socketIndex.set(opts.socketId, roomId);

    return { room, member, isReconnect: false };
  }

  // ── Leave ───────────────────────────────────────────────────────────────────

  leaveRoom(socketId: string): {
    room: Room | null;
    member: Member | null;
    newHostId: string | null;
    isGracePeriod: boolean;
  } {
    const roomId = this.socketIndex.get(socketId);
    if (!roomId) return { room: null, member: null, newHostId: null, isGracePeriod: false };

    this.socketIndex.delete(socketId);

    const room = this.rooms.get(roomId);
    if (!room) return { room: null, member: null, newHostId: null, isGracePeriod: false };

    // Find member by socketId
    let leftMember: Member | null = null;
    for (const m of room.members.values()) {
      if (m.socketId === socketId) {
        leftMember = m;
        break;
      }
    }

    if (!leftMember) return { room, member: null, newHostId: null, isGracePeriod: false };

    // Don't remove immediately — start a grace period for reconnection (page refresh)
    leftMember.disconnectedAt = Date.now();
    leftMember.socketId = ''; // Clear stale socket

    // Schedule actual removal after grace period
    const memberId = leftMember.id;
    setTimeout(() => {
      this.finalizeLeave(room.id, memberId);
    }, RECONNECT_GRACE_MS);

    return { room, member: leftMember, newHostId: null, isGracePeriod: true };
  }

  /** Called after grace period — fully removes member if they didn't reconnect. */
  private finalizeLeave(roomId: string, memberId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const member = room.members.get(memberId);
    if (!member) return;

    // If they reconnected (disconnectedAt cleared), do nothing
    if (member.disconnectedAt === null) return;

    // Still disconnected — remove for real
    room.members.delete(memberId);
    console.log(`[RoomManager] Removed ${member.username} after grace period (room ${room.code})`);

    // If room empty, schedule cleanup
    if (room.members.size === 0) {
      setTimeout(() => this.cleanupRoom(room.id), 60_000);
      return;
    }

    // Transfer host if the removed member was host
    if (member.isHost) {
      // Pick first connected member as new host
      for (const m of room.members.values()) {
        if (m.disconnectedAt === null) {
          m.isHost = true;
          room.hostId = m.id;
          console.log(`[RoomManager] Host transferred to ${m.username} in ${room.code}`);
          break;
        }
      }
    }
  }

  // ── Video State ─────────────────────────────────────────────────────────────

  updateVideoState(
    roomId: string,
    updates: Partial<VideoState>,
    updatedBy: string
  ): VideoState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const prevUrl = room.video.url;
    Object.assign(room.video, updates, {
      lastUpdateAt: Date.now(),
      updatedBy,
    });

    if (updates.url !== undefined && updates.url !== prevUrl) {
      console.log('[RoomManager] video state updated', {
        roomCode: room.code,
        name: room.video.name,
        type: room.video.type,
        urlChanged: true,
        hasUrl: !!room.video.url,
      });
      this.persistVideoState(room).catch(console.error);
    }

    return room.video;
  }

  private async persistVideoState(room: Room): Promise<void> {
    try {
      await query(
        `UPDATE rooms SET video_url = $1 WHERE id = $2`,
        [room.video.url, room.id]
      );
    } catch (_) {
      // DB unavailable — in-memory only
    }
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
      members: Array.from(room.members.values())
        .filter(m => m.disconnectedAt === null) // Hide disconnected members from clients
        .map(this.serializeMember),
      video: room.video,
      createdAt: room.createdAt,
      hasPassword: !!room.passwordHash,
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