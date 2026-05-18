import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Room, Member, ChatMessage, Reaction, STORAGE_KEYS } from '../types';
import { isSoundEnabled, setSoundEnabled } from '../utils/sounds';

// ─── User Identity ────────────────────────────────────────────────────────────

function getOrCreateUserId(): string {
  let id = localStorage.getItem(STORAGE_KEYS.USER_ID);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(STORAGE_KEYS.USER_ID, id);
  }
  return id;
}

function getOrCreateUsername(): string {
  return localStorage.getItem(STORAGE_KEYS.USERNAME) || '';
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface RoomStore {
  // Identity
  userId: string;
  username: string;
  setUsername: (name: string) => void;
  setUserId: (id: string) => void;

  // Room state
  room: Room | null;
  currentMember: Member | null;
  setRoom: (room: Room) => void;
  clearRoom: () => void;

  // Members
  addMember: (member: Member) => void;
  removeMember: (userId: string) => void;
  updateMember: (userId: string, updates: Partial<Member>) => void;
  setHost: (newHostId: string) => void;

  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;

  reactions: Reaction[];
  addReaction: (reaction: Reaction) => void;
  removeReaction: (id: string) => void;

  isChatOpen: boolean;
  isVoiceChatOpen: boolean;
  isMemberPanelOpen: boolean;
  isSettingsOpen: boolean;
  toggleChat: () => void;
  toggleVoiceChat: () => void;
  toggleMemberPanel: () => void;
  toggleSettings: () => void;

  localVideoUrl: string | null;
  localVideoName: string | null;
  setLocalVideo: (url: string, name: string) => void;
  clearLocalVideo: () => void;

  isConnected: boolean;
  latency: number;
  setConnected: (v: boolean) => void;
  setLatency: (ms: number) => void;

  soundEnabled: boolean;
  toggleSound: () => void;
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  // Identity
  userId: getOrCreateUserId(),
  username: getOrCreateUsername(),
  
  setUsername: (name) => {
    localStorage.setItem(STORAGE_KEYS.USERNAME, name);
    set({ username: name });
  },

  setUserId: (id) => {
    localStorage.setItem(STORAGE_KEYS.USER_ID, id);
    set({ userId: id });
  },

  // Room
  room: null,
  currentMember: null,
  setRoom: (room) => {
    const userId = get().userId;
    const currentMember = room.members.find(m => m.id === userId) ?? null;
    sessionStorage.setItem(STORAGE_KEYS.ROOM_CODE, room.code);
    set({ room, currentMember });
  },

  clearRoom: () => {
    sessionStorage.removeItem(STORAGE_KEYS.ROOM_CODE);
    set({ room: null, currentMember: null, messages: [], reactions: [] });
  },

  // Members
  addMember: (member) => set(state => {
    if (!state.room) return {};
    const members = [...state.room.members.filter(m => m.id !== member.id), member];
    return { room: { ...state.room, members } };
  }),
  removeMember: (userId) => set(state => {
    if (!state.room) return {};
    const members = state.room.members.filter(m => m.id !== userId);
    return { room: { ...state.room, members } };
  }),
  updateMember: (userId, updates) => set(state => {
    if (!state.room) return {};
    const members = state.room.members.map(m => m.id === userId ? { ...m, ...updates } : m);
    const currentMember = state.currentMember?.id === userId
      ? { ...state.currentMember, ...updates }
      : state.currentMember;
    return { room: { ...state.room, members }, currentMember };
  }),
  setHost: (newHostId) => set(state => {
    if (!state.room) return {};
    const members = state.room.members.map(m => ({ ...m, isHost: m.id === newHostId }));
    const currentMember = state.currentMember
      ? { ...state.currentMember, isHost: state.currentMember.id === newHostId }
      : null;
    return { room: { ...state.room, hostId: newHostId, members }, currentMember };
  }),

  messages: [],
  addMessage: (msg) => set(state => ({
    messages: [...state.messages.slice(-200), msg], 
  })),
  setMessages: (msgs) => set({ messages: msgs }),

  reactions: [],
  addReaction: (reaction) => set(state => ({
    reactions: [...state.reactions, reaction],
  })),
  removeReaction: (id) => set(state => ({
    reactions: state.reactions.filter(r => r.id !== id),
  })),

  isChatOpen: true,
  isVoiceChatOpen: false,
  isMemberPanelOpen: false,
  isSettingsOpen: false,
  toggleChat: () => set(state => ({ isChatOpen: !state.isChatOpen })),
  toggleVoiceChat: () => set(state => ({ isVoiceChatOpen: !state.isVoiceChatOpen })),
  toggleMemberPanel: () => set(state => ({ isMemberPanelOpen: !state.isMemberPanelOpen })),
  toggleSettings: () => set(state => ({ isSettingsOpen: !state.isSettingsOpen })),

  localVideoUrl: null,
  localVideoName: null,
  setLocalVideo: (url, name) => set({ localVideoUrl: url, localVideoName: name }),
  clearLocalVideo: () => {
    const url = get().localVideoUrl;
    if (url) URL.revokeObjectURL(url);
    set({ localVideoUrl: null, localVideoName: null });
  },

  isConnected: false,
  latency: 0,
  setConnected: (v) => set({ isConnected: v }),
  setLatency: (ms) => set({ latency: ms }),

  soundEnabled: isSoundEnabled(),
  toggleSound: () => {
    const next = !get().soundEnabled;
    setSoundEnabled(next);
    set({ soundEnabled: next });
  },
}));