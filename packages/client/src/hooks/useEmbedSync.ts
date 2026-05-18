import { useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { EVENTS } from '../types';
import type { SyncPayload } from './useSync';

export interface EmbedPlayerController {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  getCurrentTime: () => number | Promise<number>;
  getDuration: () => number | Promise<number>;
}

async function resolveTime(v: number | Promise<number>): Promise<number> {
  return typeof v === 'number' ? v : v;
}

interface UseEmbedSyncOptions {
  socket: Socket;
  controllerRef: React.RefObject<EmbedPlayerController | null>;
  isHost: boolean;
  active: boolean;
  latency: number;
  onSyncingChange?: (syncing: boolean) => void;
  onPlaybackNotify?: (isPlaying: boolean) => void;
}

export function useEmbedSync({
  socket,
  controllerRef,
  isHost,
  active,
  latency,
  onSyncingChange,
  onPlaybackNotify,
}: UseEmbedSyncOptions) {
  const isHostRef = useRef(isHost);
  const isApplyingRef = useRef(false);
  const latencyRef = useRef(latency);
  isHostRef.current = isHost;
  latencyRef.current = latency;

  const estimateTargetTime = useCallback((currentTime: number, isPlaying: boolean, serverTime: number) => {
    const halfRtt = (latencyRef.current || 50) / 2000;
    const elapsed = isPlaying ? (Date.now() - serverTime) / 1000 + halfRtt : 0;
    return Math.max(0, currentTime + elapsed);
  }, []);

  const applyRemote = useCallback(async (data: SyncPayload, forceSeek?: boolean) => {
    const ctrl = controllerRef.current;
    if (!ctrl || isHostRef.current) return;

    isApplyingRef.current = true;
    onSyncingChange?.(true);

    const target = estimateTargetTime(data.currentTime, data.isPlaying, data.serverTime);
    const current = await resolveTime(ctrl.getCurrentTime());

    if (forceSeek || Math.abs(current - target) > 2) {
      ctrl.seek(target);
    }

    if (data.isPlaying) ctrl.play();
    else ctrl.pause();

    onPlaybackNotify?.(data.isPlaying);
    setTimeout(() => {
      isApplyingRef.current = false;
      onSyncingChange?.(false);
    }, 300);
  }, [controllerRef, estimateTargetTime, onSyncingChange, onPlaybackNotify]);

  const emitPlay = useCallback(async () => {
    const ctrl = controllerRef.current;
    if (!ctrl || isApplyingRef.current) return;
    const t = await resolveTime(ctrl.getCurrentTime());
    socket.emit(EVENTS.VIDEO_PLAY, { currentTime: t });
  }, [socket, controllerRef]);

  const emitPause = useCallback(async () => {
    const ctrl = controllerRef.current;
    if (!ctrl || isApplyingRef.current) return;
    const t = await resolveTime(ctrl.getCurrentTime());
    socket.emit(EVENTS.VIDEO_PAUSE, { currentTime: t });
  }, [socket, controllerRef]);

  const emitSeek = useCallback(async (time: number) => {
    if (isApplyingRef.current) return;
    socket.emit(EVENTS.VIDEO_SEEK, { currentTime: time });
  }, [socket]);

  const requestSync = useCallback(() => {
    if (!isHostRef.current) socket.emit(EVENTS.VIDEO_SYNC_REQUEST);
  }, [socket]);

  useEffect(() => {
    if (!active) return;

    const onPlay = (data: { currentTime: number; serverTime: number }) => {
      if (isHostRef.current) return;
      void applyRemote({ ...data, isPlaying: true }, true);
    };
    const onPause = (data: { currentTime: number; serverTime: number }) => {
      if (isHostRef.current) return;
      void applyRemote({ ...data, isPlaying: false }, true);
    };
    const onSeek = (data: { currentTime: number; serverTime: number }) => {
      if (isHostRef.current) return;
      const ctrl = controllerRef.current;
      if (!ctrl) return;
      ctrl.seek(estimateTargetTime(data.currentTime, false, data.serverTime));
    };
    const onSync = (data: SyncPayload) => {
      if (isHostRef.current) return;
      void applyRemote(data);
    };

    socket.on(EVENTS.VIDEO_PLAY, onPlay);
    socket.on(EVENTS.VIDEO_PAUSE, onPause);
    socket.on(EVENTS.VIDEO_SEEK, onSeek);
    socket.on(EVENTS.VIDEO_SYNC, onSync);

    if (!isHost) {
      requestSync();
      const iv = setInterval(requestSync, 8000);
      return () => {
        clearInterval(iv);
        socket.off(EVENTS.VIDEO_PLAY, onPlay);
        socket.off(EVENTS.VIDEO_PAUSE, onPause);
        socket.off(EVENTS.VIDEO_SEEK, onSeek);
        socket.off(EVENTS.VIDEO_SYNC, onSync);
      };
    }

    return () => {
      socket.off(EVENTS.VIDEO_PLAY, onPlay);
      socket.off(EVENTS.VIDEO_PAUSE, onPause);
      socket.off(EVENTS.VIDEO_SEEK, onSeek);
      socket.off(EVENTS.VIDEO_SYNC, onSync);
    };
  }, [active, socket, isHost, applyRemote, estimateTargetTime, requestSync, controllerRef]);

  return { emitPlay, emitPause, emitSeek, requestSync };
}
