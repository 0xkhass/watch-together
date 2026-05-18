import { useToastStore, shouldShowToast } from '../store/toastStore';
import { useRoomStore } from '../store/roomStore';
import { playSound } from './sounds';

function addSystemMessage(content: string) {
  useRoomStore.getState().addMessage({
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: 'system',
    username: 'System',
    avatarColor: '#6366f1',
    content,
    type: 'system',
    createdAt: Date.now(),
  });
}

export function notifyMemberJoined(username: string, isSelf = false) {
  if (isSelf) return;
  playSound('join');
  const key = `join:${username}`;
  if (!shouldShowToast(key)) return;
  useToastStore.getState().addToast({
    kind: 'join',
    title: `${username} joined`,
    message: 'Welcome to the room',
  });
  addSystemMessage(`${username} joined the room`);
}

export function notifyMemberLeft(username: string) {
  playSound('leave');
  const key = `leave:${username}`;
  if (!shouldShowToast(key)) return;
  useToastStore.getState().addToast({
    kind: 'leave',
    title: `${username} left`,
  });
  addSystemMessage(`${username} left the room`);
}

export function notifyMemberReconnected(username: string, isSelf = false) {
  const key = `reconnect:${username}`;
  if (!shouldShowToast(key)) return;
  if (isSelf) {
    playSound('join');
    useToastStore.getState().addToast({
      kind: 'success',
      title: 'Reconnected',
      message: 'You are back in sync with the room',
    });
    addSystemMessage('You reconnected');
    return;
  }
  playSound('join');
  useToastStore.getState().addToast({
    kind: 'info',
    title: `${username} reconnected`,
  });
  addSystemMessage(`${username} reconnected`);
}

export function notifyHostChanged(username: string) {
  const key = `host:${username}`;
  if (!shouldShowToast(key)) return;
  useToastStore.getState().addToast({
    kind: 'host',
    title: `${username} is now the host`,
  });
  addSystemMessage(`${username} is now the host`);
}

export function notifyVideoLoaded(name: string, byHost = true) {
  const key = `video:${name}`;
  if (!shouldShowToast(key)) return;
  useToastStore.getState().addToast({
    kind: 'video',
    title: byHost ? 'New video loaded' : 'Video updated',
    message: name,
  });
  addSystemMessage(byHost ? `Host loaded "${name}"` : `Now playing "${name}"`);
}

export function notifyPlayback(isPlaying: boolean) {
  const key = `playback:${isPlaying}`;
  if (!shouldShowToast(key)) return;
  useToastStore.getState().addToast({
    kind: 'video',
    title: isPlaying ? 'Playback resumed' : 'Playback paused',
  });
}

/** Play the message blip when tab is not focused. */
export function notifyNewMessage() {
  if (document.hidden) {
    playSound('message');
  }
}
