// ─── Core Types ───────────────────────────────────────────────────────────────

export interface Member {
  id: string;
  username: string;
  avatarColor: string;
  isHost: boolean;
  joinedAt: number;
  isMuted: boolean;
  isDeafened: boolean;
}

export interface VideoState {
  url: string | null;
  name: string | null;
  type: 'url' | 'local';
  currentTime: number;
  isPlaying: boolean;
  lastUpdateAt: number;
  updatedBy: string;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  hostId: string;
  members: Member[];
  video: VideoState;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  avatarColor: string;
  content: string;
  type: 'text' | 'system' | 'reaction';
  createdAt: number;
}

export interface Reaction {
  id: string;
  userId: string;
  username: string;
  emoji: string;
  x: number; // 0-1 relative position
  y: number;
  createdAt: number;
}

export interface VoiceUser {
  userId: string;
  username: string;
  isSpeaking: boolean;
  isMuted: boolean;
  stream?: MediaStream;
}

// ─── Sync Types ───────────────────────────────────────────────────────────────

export interface SyncState {
  currentTime: number;
  isPlaying: boolean;
  serverTime: number;
  url: string | null;
  name: string | null;
  type: 'url' | 'local';
}

// ─── Socket Events ────────────────────────────────────────────────────────────

export const EVENTS = {
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_STATE: 'room:state',
  ROOM_ERROR: 'room:error',

  MEMBER_JOINED: 'member:joined',
  MEMBER_LEFT: 'member:left',
  MEMBER_UPDATED: 'member:updated',
  HOST_CHANGED: 'host:changed',

  VIDEO_LOAD: 'video:load',
  VIDEO_PLAY: 'video:play',
  VIDEO_PAUSE: 'video:pause',
  VIDEO_SEEK: 'video:seek',
  VIDEO_SYNC: 'video:sync',
  VIDEO_SYNC_REQUEST: 'video:sync:request',
  VIDEO_BUFFERING: 'video:buffering',

  CHAT_MESSAGE: 'chat:message',
  CHAT_HISTORY: 'chat:history',

  REACTION: 'reaction',

  RTC_OFFER: 'rtc:offer',
  RTC_ANSWER: 'rtc:answer',
  RTC_ICE: 'rtc:ice',
  RTC_USER_JOINED_VOICE: 'rtc:user_joined_voice',
  RTC_USER_LEFT_VOICE: 'rtc:user_left_voice',

  PING: 'ping',
  PONG: 'pong',
} as const;

// ─── Local Storage Keys ───────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  USER_ID: 'wt_user_id',
  USERNAME: 'wt_username',
} as const;