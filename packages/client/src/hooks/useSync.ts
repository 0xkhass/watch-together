import { useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { EVENTS } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 8000;
const DRIFT_HARD_THRESHOLD = 2.5;
const DRIFT_SOFT_THRESHOLD = 0.35;
const PLAYBACK_RATE_FAST = 1.04;
const PLAYBACK_RATE_SLOW = 0.96;
const SEEK_DEBOUNCE_MS = 120;
const REMOTE_GUARD_MS = 400;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncPayload {
  currentTime: number;
  isPlaying: boolean;
  serverTime: number;
  url?: string | null;
  name?: string | null;
  type?: 'url' | 'local';
}

interface UseSyncOptions {
  socket: Socket;
  videoRef: React.RefObject<HTMLVideoElement>;
  isHost: boolean;
  videoUrl: string | null;
  latency: number;
  onVideoLoad?: (
    url: string,
    name: string,
    type: 'url' | 'local',
    meta?: { provider?: string; embedId?: string; embedUrl?: string },
  ) => void;
  onPlaybackNotify?: (isPlaying: boolean) => void;
  onVideoLoadedNotify?: (name: string) => void;
}

function urlsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return a.endsWith(b) || b.endsWith(a);
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useSync({
  socket,
  videoRef,
  isHost,
  videoUrl,
  latency,
  onVideoLoad,
  onPlaybackNotify,
  onVideoLoadedNotify,
}: UseSyncOptions) {
  const isHostRef = useRef(isHost);
  const isApplyingRemoteRef = useRef(false);
  const remoteGuardUntilRef = useRef(0);
  const seekDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const rateResetRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSeekEmitRef = useRef(0);
  const latencyRef = useRef(latency);

  isHostRef.current = isHost;
  latencyRef.current = latency;

  const getVideo = () => videoRef.current;

  const setRemoteGuard = useCallback(() => {
    remoteGuardUntilRef.current = Date.now() + REMOTE_GUARD_MS;
  }, []);

  const isRemoteGuarded = () => Date.now() < remoteGuardUntilRef.current;

  const estimateTargetTime = useCallback((currentTime: number, isPlaying: boolean, serverTime: number) => {
    const halfRtt = (latencyRef.current || 50) / 2000;
    const elapsed = isPlaying ? (Date.now() - serverTime) / 1000 + halfRtt : 0;
    return Math.max(0, currentTime + elapsed);
  }, []);

  const applyRemoteState = useCallback((data: SyncPayload, opts?: { forceSeek?: boolean }) => {
    const video = getVideo();
    if (!video || isHostRef.current) return;

    isApplyingRemoteRef.current = true;
    setRemoteGuard();

    const targetTime = estimateTargetTime(data.currentTime, data.isPlaying, data.serverTime);
    const drift = Math.abs(video.currentTime - targetTime);

    if (opts?.forceSeek || drift > DRIFT_HARD_THRESHOLD) {
      video.currentTime = targetTime;
    } else if (drift > DRIFT_SOFT_THRESHOLD) {
      video.playbackRate = video.currentTime < targetTime ? PLAYBACK_RATE_FAST : PLAYBACK_RATE_SLOW;
      clearTimeout(rateResetRef.current);
      rateResetRef.current = setTimeout(() => {
        if (getVideo()) getVideo()!.playbackRate = 1;
      }, 2500);
    }

    if (data.isPlaying && video.paused) {
      video.play().catch(() => {});
    } else if (!data.isPlaying && !video.paused) {
      video.pause();
    }

    requestAnimationFrame(() => {
      isApplyingRemoteRef.current = false;
    });
  }, [estimateTargetTime, setRemoteGuard]);

  // ── Host emits ─────────────────────────────────────────────────────────────

  const emitPlay = useCallback((currentTime: number) => {
    if (isRemoteGuarded()) return;
    socket.emit(EVENTS.VIDEO_PLAY, { currentTime });
  }, [socket]);

  const emitPause = useCallback((currentTime: number) => {
    if (isRemoteGuarded()) return;
    socket.emit(EVENTS.VIDEO_PAUSE, { currentTime });
  }, [socket]);

  const emitSeek = useCallback((currentTime: number) => {
    if (isRemoteGuarded()) return;
    clearTimeout(seekDebounceRef.current);
    seekDebounceRef.current = setTimeout(() => {
      if (Date.now() - lastSeekEmitRef.current < SEEK_DEBOUNCE_MS - 20) return;
      lastSeekEmitRef.current = Date.now();
      socket.emit(EVENTS.VIDEO_SEEK, { currentTime });
    }, SEEK_DEBOUNCE_MS);
  }, [socket]);

  const emitSeekImmediate = useCallback((currentTime: number) => {
    clearTimeout(seekDebounceRef.current);
    lastSeekEmitRef.current = Date.now();
    socket.emit(EVENTS.VIDEO_SEEK, { currentTime });
  }, [socket]);

  const emitLoad = useCallback((
    url: string,
    name: string,
    type: 'url' | 'local',
    meta?: { provider?: string; embedId?: string; embedUrl?: string },
  ) => {
    socket.emit(EVENTS.VIDEO_LOAD, { url, name, type, ...meta });
  }, [socket]);

  const requestSync = useCallback(() => {
    if (!isHostRef.current) {
      socket.emit(EVENTS.VIDEO_SYNC_REQUEST);
    }
  }, [socket]);

  // ── Socket listeners ───────────────────────────────────────────────────────

  useEffect(() => {
    const onVideoLoadEvent = (data: {
      url: string;
      name: string;
      type: 'url' | 'local';
      provider?: string;
      embedId?: string;
      embedUrl?: string;
    }) => {
      if (isHostRef.current) return;
      onVideoLoadedNotify?.(data.name);
      onVideoLoad?.(data.url, data.name, data.type, data);
    };

    const onVideoError = (data: { error: string }) => {
      console.error('[Sync] video:error:', data.error);
    };

    const onPlay = (data: { currentTime: number; serverTime: number }) => {
      if (isHostRef.current) return;
      const video = getVideo();
      if (!video) return;
      onPlaybackNotify?.(true);
      applyRemoteState({ ...data, isPlaying: true }, { forceSeek: true });
    };

    const onPause = (data: { currentTime: number; serverTime: number }) => {
      if (isHostRef.current) return;
      const video = getVideo();
      if (!video) return;
      onPlaybackNotify?.(false);
      applyRemoteState({ ...data, isPlaying: false }, { forceSeek: true });
    };

    const onSeek = (data: { currentTime: number; serverTime: number }) => {
      if (isHostRef.current) return;
      const video = getVideo();
      if (!video) return;
      setRemoteGuard();
      isApplyingRemoteRef.current = true;
      video.currentTime = estimateTargetTime(data.currentTime, false, data.serverTime);
      requestAnimationFrame(() => { isApplyingRemoteRef.current = false; });
    };

    const onVideoSync = (data: SyncPayload) => {
      if (isHostRef.current) return;
      const video = getVideo();
      if (!video) return;

      if (data.url && videoUrl && !urlsMatch(video.src || '', data.url)) {
        onVideoLoad?.(data.url, data.name ?? '', data.type ?? 'url');
        return;
      }

      if (isRemoteGuarded()) return;
      applyRemoteState(data);
    };

    socket.on(EVENTS.VIDEO_LOAD, onVideoLoadEvent);
    socket.on(EVENTS.VIDEO_ERROR, onVideoError);
    socket.on(EVENTS.VIDEO_PLAY, onPlay);
    socket.on(EVENTS.VIDEO_PAUSE, onPause);
    socket.on(EVENTS.VIDEO_SEEK, onSeek);
    socket.on(EVENTS.VIDEO_SYNC, onVideoSync);

    let interval: ReturnType<typeof setInterval> | undefined;
    if (!isHost && videoUrl) {
      requestSync();
      interval = setInterval(requestSync, SYNC_INTERVAL_MS);
    }

    return () => {
      socket.off(EVENTS.VIDEO_LOAD, onVideoLoadEvent);
      socket.off(EVENTS.VIDEO_ERROR, onVideoError);
      socket.off(EVENTS.VIDEO_PLAY, onPlay);
      socket.off(EVENTS.VIDEO_PAUSE, onPause);
      socket.off(EVENTS.VIDEO_SEEK, onSeek);
      socket.off(EVENTS.VIDEO_SYNC, onVideoSync);
      clearInterval(interval);
      clearTimeout(seekDebounceRef.current);
      clearTimeout(rateResetRef.current);
    };
  }, [
    socket,
    isHost,
    videoUrl,
    applyRemoteState,
    estimateTargetTime,
    onVideoLoad,
    onPlaybackNotify,
    onVideoLoadedNotify,
    requestSync,
    setRemoteGuard,
  ]);

  // Re-sync when video element becomes available or URL changes
  useEffect(() => {
    if (isHost || !videoUrl) return;
    const video = getVideo();
    if (!video) return;

    const onCanPlay = () => requestSync();
    video.addEventListener('loadedmetadata', onCanPlay);
    return () => video.removeEventListener('loadedmetadata', onCanPlay);
  }, [isHost, videoUrl, requestSync]);

  // Re-sync on socket reconnect
  useEffect(() => {
    const onConnect = () => {
      if (!isHostRef.current) requestSync();
    };
    socket.on('connect', onConnect);
    return () => { socket.off('connect', onConnect); };
  }, [socket, requestSync]);

  return {
    emitPlay,
    emitPause,
    emitSeek,
    emitSeekImmediate,
    emitLoad,
    requestSync,
    isApplyingRemote: () => isApplyingRemoteRef.current,
  };
}
