import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { ParsedVideoSource, isEmbedProvider } from '../utils/videoSource';
import type { EmbedPlayerController } from '../hooks/useEmbedSync';

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YtPlayer }) => void;
            onStateChange?: (e: { data: number; target: YtPlayer }) => void;
          };
        },
      ) => YtPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; BUFFERING: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
    Vimeo?: {
      Player: new (
        el: HTMLElement,
        opts: { id: number; width?: number; height?: number },
      ) => VimeoPlayer;
    };
  }
}

interface YtPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

interface VimeoPlayer {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  setCurrentTime: (t: number) => Promise<number>;
  getCurrentTime: () => Promise<number>;
  getDuration: () => Promise<number>;
  on: (event: string, cb: () => void) => void;
  destroy: () => void;
}

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });
}

function loadVimeoApi(): Promise<void> {
  if (window.Vimeo?.Player) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="player.vimeo.com/api"]')) {
      const t = setInterval(() => {
        if (window.Vimeo?.Player) {
          clearInterval(t);
          resolve();
        }
      }, 50);
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://player.vimeo.com/api/player.js';
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('Vimeo API failed to load'));
    document.head.appendChild(tag);
  });
}

interface EmbedPlayerProps {
  source: ParsedVideoSource;
  isHost: boolean;
  onReady?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onTimeUpdate?: (time: number, duration: number) => void;
}

export const EmbedPlayer = forwardRef<EmbedPlayerController, EmbedPlayerProps>(
  function EmbedPlayer({ source, isHost, onReady, onPlay, onPause, onTimeUpdate }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const ytRef = useRef<YtPlayer | null>(null);
    const vimeoRef = useRef<VimeoPlayer | null>(null);
    const tickRef = useRef<ReturnType<typeof setInterval>>();

    // ── Stable callback refs (prevents player re-initialization on parent re-render) ──
    const onReadyRef = useRef(onReady);
    const onPlayRef = useRef(onPlay);
    const onPauseRef = useRef(onPause);
    const onTimeUpdateRef = useRef(onTimeUpdate);
    onReadyRef.current = onReady;
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
    onTimeUpdateRef.current = onTimeUpdate;

    const getController = useCallback((): EmbedPlayerController => {
      if (source.provider === 'youtube' && ytRef.current) {
        const p = ytRef.current;
        return {
          play: () => p.playVideo(),
          pause: () => p.pauseVideo(),
          seek: (t) => p.seekTo(t, true),
          getCurrentTime: () => p.getCurrentTime(),
          getDuration: () => p.getDuration(),
        };
      }
      if (source.provider === 'vimeo' && vimeoRef.current) {
        const p = vimeoRef.current;
        return {
          play: () => { void p.play(); },
          pause: () => { void p.pause(); },
          seek: (t) => { void p.setCurrentTime(t); },
          getCurrentTime: () => p.getCurrentTime().then((n) => n),
          getDuration: () => p.getDuration().then((n) => n),
        };
      }
      return {
        play: () => {},
        pause: () => {},
        seek: () => {},
        getCurrentTime: () => 0,
        getDuration: () => 0,
      };
    }, [source.provider]);

    useImperativeHandle(ref, getController, [getController]);

    // Only re-run when provider or videoId changes — callbacks are via stable refs
    useEffect(() => {
      const el = containerRef.current;
      if (!el || !isEmbedProvider(source.provider)) return;

      let destroyed = false;

      const setup = async () => {
        if (source.provider === 'youtube' && source.videoId) {
          await loadYouTubeApi();
          if (destroyed || !containerRef.current) return;
          ytRef.current = new window.YT!.Player(containerRef.current, {
            videoId: source.videoId,
            playerVars: {
              autoplay: 0,
              controls: isHost ? 1 : 0,
              modestbranding: 1,
              rel: 0,
              enablejsapi: 1,
            },
            events: {
              onReady: () => {
                onReadyRef.current?.();
                tickRef.current = setInterval(() => {
                  const c = ytRef.current;
                  if (!c) return;
                  onTimeUpdateRef.current?.(c.getCurrentTime(), c.getDuration());
                }, 250);
              },
              onStateChange: (e) => {
                if (e.data === window.YT!.PlayerState.PLAYING) onPlayRef.current?.();
                if (e.data === window.YT!.PlayerState.PAUSED) onPauseRef.current?.();
              },
            },
          });
          return;
        }

        if (source.provider === 'vimeo' && source.videoId) {
          await loadVimeoApi();
          if (destroyed || !containerRef.current) return;
          const div = document.createElement('div');
          div.style.width = '100%';
          div.style.height = '100%';
          containerRef.current.innerHTML = '';
          containerRef.current.appendChild(div);
          vimeoRef.current = new window.Vimeo!.Player(div, {
            id: parseInt(source.videoId, 10),
            width: el.clientWidth,
            height: el.clientHeight,
          });
          vimeoRef.current.on('loaded', () => onReadyRef.current?.());
          vimeoRef.current.on('play', () => onPlayRef.current?.());
          vimeoRef.current.on('pause', () => onPauseRef.current?.());
          tickRef.current = setInterval(() => {
            const p = vimeoRef.current;
            if (!p) return;
            void p.getCurrentTime().then((t) => {
              void p.getDuration().then((d) => onTimeUpdateRef.current?.(t, d));
            });
          }, 250);
        }
      };

      void setup();

      return () => {
        destroyed = true;
        clearInterval(tickRef.current);
        ytRef.current?.destroy();
        ytRef.current = null;
        vimeoRef.current?.destroy();
        vimeoRef.current = null;
      };
    }, [source.provider, source.videoId, isHost]); // ← Stable deps only

    if (source.provider === 'youtube' || source.provider === 'vimeo') {
      return (
        <div className="relative w-full h-full bg-black">
          <div ref={containerRef} className="w-full h-full" />
          {!isHost && (
            <div className="absolute inset-0 z-10 cursor-default" aria-hidden title="Following host" />
          )}
        </div>
      );
    }

    return (
      <div className="relative w-full h-full bg-black">
        <iframe
          src={source.embedUrl}
          title={source.name}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
        {!isHost && <div className="absolute inset-0 z-10" aria-hidden />}
        {source.provider === 'embed' && (
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/60 bg-black/70 px-3 py-1 rounded-full max-w-md text-center">
            Some sites block embedding. Use YouTube, Vimeo, or a direct .mp4 link for best sync.
          </p>
        )}
      </div>
    );
  },
);
