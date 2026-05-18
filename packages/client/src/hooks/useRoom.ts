import { useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { connectSocket, getSocket, waitForSocketConnection } from "../services/socket";
import { useRoomStore } from "../store/roomStore";
import { EVENTS, ChatMessage, Reaction, Member } from "../types";
import {
  notifyMemberJoined,
  notifyMemberLeft,
  notifyMemberReconnected,
  notifyHostChanged,
  notifyNewMessage,
} from "../utils/roomNotifications";
import { useToastStore } from "../store/toastStore";

export function useRoom() {
  const navigate = useNavigate();
  const pingIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const wasDisconnectedRef = useRef(false);

  const socket = connectSocket();

  // ── Latency + connection ───────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket();

    const onPong = (ts: number) => {
      useRoomStore.getState().setLatency(Date.now() - ts);
    };

    const onConnect = () => {
      useRoomStore.getState().setConnected(true);
      if (wasDisconnectedRef.current && useRoomStore.getState().room) {
        useToastStore.getState().addToast({
          kind: "success",
          title: "Connection restored",
          message: "Syncing with the room…",
        });
      }
      wasDisconnectedRef.current = false;
    };

    const onDisconnect = () => {
      useRoomStore.getState().setConnected(false);
      wasDisconnectedRef.current = true;
    };

    socket.on(EVENTS.PONG, onPong);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    if (socket.connected) useRoomStore.getState().setConnected(true);

    pingIntervalRef.current = setInterval(() => {
      if (socket.connected) socket.emit(EVENTS.PING, Date.now());
    }, 3000);

    return () => {
      socket.off(EVENTS.PONG, onPong);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      clearInterval(pingIntervalRef.current);
    };
  }, []);

  // ── Room events (global — not gated on room id so reconnect handlers work) ──

  useEffect(() => {
    const socket = getSocket();

    const onMemberJoined = (data: { member: Member }) => {
      const s = useRoomStore.getState();
      s.addMember(data.member);
      notifyMemberJoined(data.member.username, data.member.id === s.userId);
    };

    const onMemberReconnected = (data: { member: Member }) => {
      const s = useRoomStore.getState();
      s.addMember(data.member);
      notifyMemberReconnected(
        data.member.username,
        data.member.id === s.userId,
      );
    };

    const onMemberLeft = (data: { userId: string }) => {
      const s = useRoomStore.getState();
      const member = s.room?.members.find(
        (m) => m.id === data.userId,
      );
      s.removeMember(data.userId);
      if (member) notifyMemberLeft(member.username);
    };

    const onMemberUpdated = (data: {
      userId: string;
      isMuted?: boolean;
      isDeafened?: boolean;
    }) => {
      useRoomStore.getState().updateMember(data.userId, data);
    };

    const onHostChanged = (data: {
      newHostId: string;
      newHostUsername?: string;
    }) => {
      const s = useRoomStore.getState();
      s.setHost(data.newHostId);
      const name =
        data.newHostUsername ??
        s.room?.members.find((m) => m.id === data.newHostId)
          ?.username ??
        "Someone";
      notifyHostChanged(name);
    };

    const onChatMessage = (msg: ChatMessage) => {
      useRoomStore.getState().addMessage(msg);
      // Play blip if message is from someone else and tab is not focused
      if (msg.userId !== useRoomStore.getState().userId) {
        notifyNewMessage();
      }
    };

    const onChatHistory = (msgs: ChatMessage[]) => {
      useRoomStore.getState().setMessages(msgs);
    };

    const onReaction = (reaction: Reaction) => {
      const s = useRoomStore.getState();
      s.addReaction(reaction);
      setTimeout(() => useRoomStore.getState().removeReaction(reaction.id), 3500);
    };

    socket.on(EVENTS.MEMBER_JOINED, onMemberJoined);
    socket.on(EVENTS.MEMBER_RECONNECTED, onMemberReconnected);
    socket.on(EVENTS.MEMBER_LEFT, onMemberLeft);
    socket.on(EVENTS.MEMBER_UPDATED, onMemberUpdated);
    socket.on(EVENTS.HOST_CHANGED, onHostChanged);
    socket.on(EVENTS.CHAT_MESSAGE, onChatMessage);
    socket.on(EVENTS.CHAT_HISTORY, onChatHistory);
    socket.on(EVENTS.REACTION, onReaction);

    return () => {
      socket.off(EVENTS.MEMBER_JOINED, onMemberJoined);
      socket.off(EVENTS.MEMBER_RECONNECTED, onMemberReconnected);
      socket.off(EVENTS.MEMBER_LEFT, onMemberLeft);
      socket.off(EVENTS.MEMBER_UPDATED, onMemberUpdated);
      socket.off(EVENTS.HOST_CHANGED, onHostChanged);
      socket.off(EVENTS.CHAT_MESSAGE, onChatMessage);
      socket.off(EVENTS.CHAT_HISTORY, onChatHistory);
      socket.off(EVENTS.REACTION, onReaction);
    };
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  // NOTE: We use useRoomStore.getState() inside callbacks instead of the
  // reactive `store` object so that these callbacks are referentially stable
  // and don't trigger useEffect re-runs when store state changes.

  const createRoom = useCallback(
    async (username: string, roomName?: string, password?: string) => {
      const socket = getSocket();
      const state = useRoomStore.getState();
      state.setUsername(username);
      await waitForSocketConnection(socket);

      return new Promise<{ code: string }>((resolve, reject) => {
        socket.emit(
          EVENTS.ROOM_CREATE,
          { name: roomName, password, username, userId: state.userId },
          (res: {
            success: boolean;
            room?: typeof state.room;
            userId?: string;
            error?: string;
          }) => {
            if (!res.success || !res.room) {
              reject(new Error(res.error || "Failed to create room"));
              return;
            }
            const s = useRoomStore.getState();
            s.setRoom(res.room);
            if (res.userId) s.setUserId(res.userId);
            resolve({ code: res.room.code });
          },
        );
      });
    },
    [],
  );

  const joinRoom = useCallback(
    async (code: string, username: string, password?: string) => {
      const socket = getSocket();
      const state = useRoomStore.getState();
      state.setUsername(username);
      await waitForSocketConnection(socket);

      return new Promise<void>((resolve, reject) => {
        socket.emit(
          EVENTS.ROOM_JOIN,
          { code, username, userId: state.userId, password },
          (res: {
            success: boolean;
            room?: typeof state.room;
            userId?: string;
            isReconnect?: boolean;
            error?: string;
          }) => {
            if (!res.success || !res.room) {
              reject(new Error(res.error || "Room not found"));
              return;
            }
            const s = useRoomStore.getState();
            s.setRoom(res.room);
            if (res.userId) s.setUserId(res.userId);
            if (res.isReconnect) {
              notifyMemberReconnected(username, true);
            }
            resolve();
          },
        );
      });
    },
    [],
  );

  const leaveRoom = useCallback(() => {
    const socket = getSocket();
    socket.emit(EVENTS.ROOM_LEAVE);
    const s = useRoomStore.getState();
    s.clearRoom();
    s.clearLocalVideo();
    navigate("/");
  }, [navigate]);

  const sendMessage = useCallback((content: string) => {
    getSocket().emit(EVENTS.CHAT_MESSAGE, { content });
  }, []);

  const sendReaction = useCallback((emoji: string, x = 0.5, y = 0.8) => {
    getSocket().emit(EVENTS.REACTION, { emoji, x, y });
  }, []);

  return {
    socket,
    createRoom,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendReaction,
  };
}
