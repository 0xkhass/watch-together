import { useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { EVENTS } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 5000;       // How often guests request sync
const DRIFT_HARD_THRESHOLD = 3.0;   // Seconds: hard seek
const DRIFT_SOFT_THRESHOLD = 0.5;   // Seconds: rate adjust
const PLAYBACK_RATE_FAST = 1.05;    // Catch up
const PLAYBACK_RATE_SLOW = 0.95;    // Slow down
const PLAYBACK_RATE_NORMAL = 1.0;

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseSyncOptions {
  socket: Socket;
  videoRef: React.RefObject<HTMLVideoElement>;
  isHost: boolean;
  onVideoLoad?: (url: string, name: string, type: 'url' | 'local') => void;
}

export function useSync({ socket, videoRef, isHost, onVideoLoad }: UseSyncOptions) {
  const syncIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  // ── Host: Emit events when video state changes ─────────────────────────────

  const emitPlay = useCallback((currentTime: number) => {
    socket.emit(EVENTS.VIDEO_PLAY, { currentTime });
  }, [socket]);

  const emitPause = useCallback((currentTime: number) => {
    socket.emit(EVENTS.VIDEO_PAUSE, { currentTime });
  }, [socket]);

  const emitSeek = useCallback((currentTime: number) => {
    socket.emit(EVENTS.VIDEO_SEEK, { currentTime });
  }, [socket]);

  const emitLoad = useCallback((url: string, name: string, type: 'url' | 'local') => {
    socket.emit(EVENTS.VIDEO_LOAD, { url, name, type });
  }, [socket]);

  // ── Guest: Apply incoming sync state ──────────────────────────────────────

  const applySync = useCallback((data: {
    currentTime: number;
    isPlaying: boolean;
    serverTime: number;
  }) => {
    const video = videoRef.current;
    if (!video || isHostRef.current) return;

    // Compensate for network latency (half round-trip estimate)
    const networkDelay = (Date.now() - data.serverTime) / 1000;
    const targetTime = data.currentTime + (data.isPlaying ? networkDelay : 0);

    // Drift correction
    const drift = Math.abs(video.currentTime - targetTime);

    if (drift > DRIFT_HARD_THRESHOLD) {
      // Hard seek for large drift
      video.currentTime = targetTime;
      console.log(`[Sync] Hard seek: drift=${drift.toFixed(2)}s`);
    } else if (drift > DRIFT_SOFT_THRESHOLD) {
      // Rate adjustment for small drift
      if (video.currentTime < targetTime) {
        video.playbackRate = PLAYBACK_RATE_FAST;
      } else {
        video.playbackRate = PLAYBACK_RATE_SLOW;
      }
      // Reset rate after correction
      setTimeout(() => {
        if (videoRef.current) videoRef.current.playbackRate = PLAYBACK_RATE_NORMAL;
      }, 3000);
    }

    // Sync play/pause state
    if (data.isPlaying && video.paused) {
      video.play().catch(() => {});
    } else if (!data.isPlaying && !video.paused) {
      video.pause();
    }
  }, [videoRef]);

  // ── Socket Event Listeners ─────────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current;

    // Incoming: video loaded by host
    const onVideoLoad_handler = (data: { url: string; name: string; type: 'url' | 'local' }) => {
      if (!isHostRef.current) {
        onVideoLoad?.(data.url, data.name, data.type);
      }
    };

    // Incoming: host played
    const onPlay = (data: { currentTime: number; serverTime: number }) => {
      if (isHostRef.current || !video) return;
      const networkDelay = (Date.now() - data.serverTime) / 1000;
      const targetTime = data.currentTime + networkDelay;

      if (Math.abs(video.currentTime - targetTime) > DRIFT_SOFT_THRESHOLD) {
        video.currentTime = targetTime;
      }
      video.play().catch(() => {});
    };

    // Incoming: host paused
    const onPause = (data: { currentTime: number }) => {
      if (isHostRef.current || !video) return;
      video.pause();
      if (Math.abs(video.currentTime - data.currentTime) > DRIFT_SOFT_THRESHOLD) {
        video.currentTime = data.currentTime;
      }
    };

    // Incoming: host seeked
    const onSeek = (data: { currentTime: number; serverTime: number }) => {
      if (isHostRef.current || !video) return;
      video.currentTime = data.currentTime;
    };

    // Incoming: periodic sync state
    const onVideoSync = (data: {
      currentTime: number;
      isPlaying: boolean;
      serverTime: number;
      url: string | null;
      name: string | null;
      type: 'url' | 'local';
    }) => {
      if (!isHostRef.current) {
        // Load video if URL changed
        if (data.url && video && video.src !== data.url) {
          onVideoLoad?.(data.url, data.name ?? '', data.type);
        }
        applySync(data);
      }
    };

    socket.on(EVENTS.VIDEO_LOAD, onVideoLoad_handler);
    socket.on(EVENTS.VIDEO_PLAY, onPlay);
    socket.on(EVENTS.VIDEO_PAUSE, onPause);
    socket.on(EVENTS.VIDEO_SEEK, onSeek);
    socket.on(EVENTS.VIDEO_SYNC, onVideoSync);

    // Guests request sync periodically
    let interval: ReturnType<typeof setInterval>;
    if (!isHost) {
      // Initial sync request
      socket.emit(EVENTS.VIDEO_SYNC_REQUEST);

      interval = setInterval(() => {
        socket.emit(EVENTS.VIDEO_SYNC_REQUEST);
      }, SYNC_INTERVAL_MS);
      syncIntervalRef.current = interval;
    }

    return () => {
      socket.off(EVENTS.VIDEO_LOAD, onVideoLoad_handler);
      socket.off(EVENTS.VIDEO_PLAY, onPlay);
      socket.off(EVENTS.VIDEO_PAUSE, onPause);
      socket.off(EVENTS.VIDEO_SEEK, onSeek);
      socket.off(EVENTS.VIDEO_SYNC, onVideoSync);
      clearInterval(interval);
    };
  }, [socket, isHost, videoRef, applySync, onVideoLoad]);

  return { emitPlay, emitPause, emitSeek, emitLoad };
}