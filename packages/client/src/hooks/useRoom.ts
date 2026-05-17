import { useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { connectSocket, getSocket } from "../services/socket";
import { useRoomStore } from "../store/roomStore";
import { EVENTS, ChatMessage, Reaction } from "../types";

export function useRoom() {
  const navigate = useNavigate();
  const store = useRoomStore();
  const pingIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const pingStartRef = useRef<number>(0);

  const socket = connectSocket();

  // ── Latency Measurement ────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket();

    const onPong = (ts: number) => {
      store.setLatency(Date.now() - ts);
    };

    socket.on(EVENTS.PONG, onPong);
    socket.on("connect", () => store.setConnected(true));
    socket.on("disconnect", () => store.setConnected(false));

    // Start pinging
    pingIntervalRef.current = setInterval(() => {
      pingStartRef.current = Date.now();
      socket.emit(EVENTS.PING, pingStartRef.current);
    }, 3000);

    return () => {
      socket.off(EVENTS.PONG, onPong);
      clearInterval(pingIntervalRef.current);
    };
  }, []);

  // ── Room Events ────────────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket();
    if (!store.room) return;

    const onMemberJoined = (data: {
      member: (typeof store.room.members)[0];
    }) => {
      store.addMember(data.member);
      store.addMessage({
        id: `sys-${Date.now()}`,
        userId: "system",
        username: "System",
        avatarColor: "#6366f1",
        content: `${data.member.username} joined the room`,
        type: "system",
        createdAt: Date.now(),
      });
    };

    const onMemberLeft = (data: { userId: string }) => {
      const member = store.room?.members.find((m) => m.id === data.userId);
      store.removeMember(data.userId);
      if (member) {
        store.addMessage({
          id: `sys-${Date.now()}`,
          userId: "system",
          username: "System",
          avatarColor: "#6366f1",
          content: `${member.username} left the room`,
          type: "system",
          createdAt: Date.now(),
        });
      }
    };

    const onMemberUpdated = (data: {
      userId: string;
      isMuted?: boolean;
      isDeafened?: boolean;
    }) => {
      store.updateMember(data.userId, data);
    };

    const onHostChanged = (data: { newHostId: string }) => {
      store.setHost(data.newHostId);
      const newHost = store.room?.members.find((m) => m.id === data.newHostId);
      store.addMessage({
        id: `sys-${Date.now()}`,
        userId: "system",
        username: "System",
        avatarColor: "#6366f1",
        content: `${newHost?.username ?? "Someone"} is now the host`,
        type: "system",
        createdAt: Date.now(),
      });
    };

    const onChatMessage = (msg: ChatMessage) => {
      store.addMessage(msg);
    };

    const onChatHistory = (msgs: ChatMessage[]) => {
      store.setMessages(msgs);
    };

    const onReaction = (reaction: Reaction) => {
      store.addReaction(reaction);
      setTimeout(() => store.removeReaction(reaction.id), 3500);
    };

    socket.on(EVENTS.MEMBER_JOINED, onMemberJoined);
    socket.on(EVENTS.MEMBER_LEFT, onMemberLeft);
    socket.on(EVENTS.MEMBER_UPDATED, onMemberUpdated);
    socket.on(EVENTS.HOST_CHANGED, onHostChanged);
    socket.on(EVENTS.CHAT_MESSAGE, onChatMessage);
    socket.on(EVENTS.CHAT_HISTORY, onChatHistory);
    socket.on(EVENTS.REACTION, onReaction);

    return () => {
      socket.off(EVENTS.MEMBER_JOINED, onMemberJoined);
      socket.off(EVENTS.MEMBER_LEFT, onMemberLeft);
      socket.off(EVENTS.MEMBER_UPDATED, onMemberUpdated);
      socket.off(EVENTS.HOST_CHANGED, onHostChanged);
      socket.off(EVENTS.CHAT_MESSAGE, onChatMessage);
      socket.off(EVENTS.CHAT_HISTORY, onChatHistory);
      socket.off(EVENTS.REACTION, onReaction);
    };
  }, [store.room?.id]);

  // ── Actions ────────────────────────────────────────────────────────────────

  // Replace your createRoom function with this:
  const createRoom = useCallback(
    async (username: string, roomName?: string) => {
      const socket = getSocket();
      store.setUsername(username);

      return new Promise<{ code: string }>((resolve, reject) => {
        socket.emit(
          EVENTS.ROOM_CREATE,
          {
            name: roomName,
            username,
            userId: store.userId,
          },
          (res: {
            success: boolean;
            room?: typeof store.room;
            userId?: string;
            error?: string;
          }) => {
            if (!res.success || !res.room) {
              reject(new Error(res.error || "Failed to create room"));
              return;
            }

            // 1. Save the room to the store
            store.setRoom(res.room);

            // 2. SAVE THE USER ID SO YOU ARE RECOGNIZED AS HOST!
            if (res.userId && store.setUserId) {
              store.setUserId(res.userId);
            }

            resolve({ code: res.room.code });
          },
        );
      });
    },
    [store],
  );

  // Replace your joinRoom function with this:
  const joinRoom = useCallback(
    async (code: string, username: string) => {
      const socket = getSocket();
      store.setUsername(username);

      return new Promise<void>((resolve, reject) => {
        socket.emit(
          EVENTS.ROOM_JOIN,
          {
            code,
            username,
            userId: store.userId,
          },
          (res: {
            success: boolean;
            room?: typeof store.room;
            userId?: string;
            error?: string;
          }) => {
            if (!res.success || !res.room) {
              reject(new Error(res.error || "Room not found"));
              return;
            }

            store.setRoom(res.room);

            // 2. SAVE THE USER ID FOR GUESTS TOO!
            if (res.userId && store.setUserId) {
              store.setUserId(res.userId);
            }

            resolve();
          },
        );
      });
    },
    [store],
  );

  const leaveRoom = useCallback(() => {
    const socket = getSocket();
    socket.emit(EVENTS.ROOM_LEAVE);
    store.clearRoom();
    store.clearLocalVideo();
    navigate("/");
  }, [store, navigate]);

  const sendMessage = useCallback((content: string) => {
    const socket = getSocket();
    socket.emit(EVENTS.CHAT_MESSAGE, { content });
  }, []);

  const sendReaction = useCallback((emoji: string, x = 0.5, y = 0.8) => {
    const socket = getSocket();
    socket.emit(EVENTS.REACTION, { emoji, x, y });
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
