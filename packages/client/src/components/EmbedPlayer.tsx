import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useState } from 'react';
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
      PlayerState: { PLAYING: number; PAUSED: number; BUFFERING: number; ENDED: number; UNSTARTED: number; };
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
  return new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.onerror = () => reject(new Error('Failed to load YouTube API. Your ad blocker or network might be blocking it.'));
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
  source: ParsedVideoSource & { isPlaying?: boolean; currentTime?: number };
  isHost: boolean;
  onReady?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onTimeUpdate?: (time: number, duration: number) => void;
}

export const EmbedPlayer = forwardRef<EmbedPlayerController, EmbedPlayerProps>(
  function EmbedPlayer({ source, isHost, onReady, onPlay, onPause, onTimeUpdate }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const ytRef = useRef<YtPlayer | null>(null);
    const vimeoRef = useRef<VimeoPlayer | null>(null);
    const tickRef = useRef<ReturnType<typeof setInterval>>();
    const [localState, setLocalState] = useState<'unstarted' | 'playing' | 'paused' | 'buffering'>('unstarted');
    const [showStuckButton, setShowStuckButton] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [guestAutoplay, setGuestAutoplay] = useState(false);
    
    // Virtual time tracking for guest iframe
    const guestTimeRef = useRef(0);
    const guestPlayTimerRef = useRef<ReturnType<typeof setInterval>>();

    // Guest sync logic for iframe fallback
    useEffect(() => {
      if (!isHost && source.provider === 'youtube') {
        const win = iframeRef.current?.contentWindow;
        if (source.isPlaying) {
          if (!guestAutoplay) {
            setShowStuckButton(true);
          } else {
            // Already unlocked! Just play.
            if (win) {
              win.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget1' }), '*');
              win.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
            }
            setShowStuckButton(false);
          }
        } else {
          // Host paused. Just pause. DO NOT reset guestAutoplay!
          if (win) {
             win.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
          }
          setShowStuckButton(false);
        }
      } else {
        // Original logic for other providers or host
        if (!isHost && source.isPlaying && localState !== 'playing') {
          setShowStuckButton(true);
        } else if (localState === 'playing') {
          setShowStuckButton(false);
        }
      }
    }, [isHost, source.isPlaying, source.provider, guestAutoplay, localState]);

    useEffect(() => {
      if (!isHost && source.isPlaying && localState === 'paused' && source.provider !== 'youtube') {
        const t = setTimeout(() => setShowStuckButton(true), 100);
        return () => clearTimeout(t);
      }
    }, [isHost, source.isPlaying, localState, source.provider]);

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
          play: () => { p.playVideo(); },
          pause: () => { p.pauseVideo(); },
          seek: (t) => { p.seekTo(t, true); },
          getCurrentTime: () => p.getCurrentTime(),
          getDuration: () => p.getDuration(),
        };
      }
      if (source.provider === 'youtube' && !isHost && iframeRef.current) {
        const win = iframeRef.current.contentWindow;
        return {
          play: () => {
            if (win) {
              win.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget1' }), '*');
              win.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
            }
            clearInterval(guestPlayTimerRef.current);
            guestPlayTimerRef.current = setInterval(() => {
              guestTimeRef.current += 0.25;
            }, 250);
          },
          pause: () => {
            if (win) win.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
            clearInterval(guestPlayTimerRef.current);
          },
          seek: (t) => {
            if (win) {
              win.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget1' }), '*');
              win.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [t, true] }), '*');
            }
            guestTimeRef.current = t;
          },
          getCurrentTime: async () => guestTimeRef.current,
          getDuration: async () => 0,
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
        try {
          if (source.provider === 'youtube' && source.videoId) {
            if (!isHost) {
              // Guests use raw iframe, no JS API
              return;
            }
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
                origin: window.location.origin,
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
                  // ── FIX 4: Keep UNSTARTED as its own state, not merged with 'paused' ──
                  // Previously UNSTARTED was mapped to 'paused', which caused the stuck
                  // detection timer to reset on every state change and never fire.
                  const S = window.YT!.PlayerState;
                  if (e.data === S.PLAYING) {
                    setLocalState('playing');
                    onPlayRef.current?.();
                  } else if (e.data === S.BUFFERING) {
                    setLocalState('buffering');
                  } else if (e.data === S.PAUSED) {
                    setLocalState('paused');
                    onPauseRef.current?.();
                  } else if (e.data === S.ENDED) {
                    setLocalState('paused');
                  } else if (e.data === S.UNSTARTED) {
                    setLocalState('unstarted'); // keep separate so Fix 1 can catch it
                  }
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
            vimeoRef.current.on('loaded', () => { setLocalState('paused'); onReadyRef.current?.(); });
            vimeoRef.current.on('play', () => { setLocalState('playing'); onPlayRef.current?.(); });
            vimeoRef.current.on('playing', () => { setLocalState('playing'); });
            vimeoRef.current.on('pause', () => { setLocalState('paused'); onPauseRef.current?.(); });
            vimeoRef.current.on('waiting', () => { setLocalState('buffering'); });
            vimeoRef.current.on('ended', () => { setLocalState('paused'); });
            tickRef.current = setInterval(() => {
              const p = vimeoRef.current;
              if (!p) return;
              void p.getCurrentTime().then((t) => {
                void p.getDuration().then((d) => onTimeUpdateRef.current?.(t, d));
              });
            }, 250);
          }
        } catch (err: any) {
          if (!destroyed) setErrorMsg(err.message || 'Failed to load video player API');
        }
      };

      void setup();

      return () => {
        destroyed = true;
        clearInterval(tickRef.current);
        clearInterval(guestPlayTimerRef.current);
        ytRef.current?.destroy();
        ytRef.current = null;
        vimeoRef.current?.destroy();
        vimeoRef.current = null;
      };
    }, [source.provider, source.videoId, isHost]); // ← Stable deps only

    if (source.provider === 'youtube' || source.provider === 'vimeo') {
      return (
        <div className="relative w-full h-full bg-black">
          {errorMsg ? (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-6 text-center">
               <div className="bg-red-900/30 text-red-200 p-8 rounded-2xl max-w-lg border border-red-500/30 shadow-2xl backdrop-blur-md">
                 <h3 className="text-xl font-bold mb-3 flex items-center justify-center gap-2 text-red-400">
                   <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                   Player Blocked
                 </h3>
                 <p className="opacity-90">{errorMsg}</p>
                 <p className="mt-4 text-sm opacity-70">Try disabling your ad blocker, Nano Defender, or VPN for this site.</p>
               </div>
            </div>
          ) : !isHost && source.provider === 'youtube' ? (
            <iframe
              ref={iframeRef}
              src={`https://www.youtube.com/embed/${source.videoId}?autoplay=0&controls=1&modestbranding=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&start=${Math.floor(source.currentTime ?? 0)}`}
              className="w-full h-full border-0"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          ) : (
            <div ref={containerRef} className="w-full h-full" />
          )}

          {/* Autoplay Unlock Button */}
          {showStuckButton && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <button 
                onClick={() => {
                  if (!isHost && source.provider === 'youtube') {
                    const win = iframeRef.current?.contentWindow;
                    if (win) {
                      win.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget1' }), '*');
                      win.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
                    }
                    setGuestAutoplay(true);
                    setShowStuckButton(false);
                  } else {
                    const ctrl = getController();
                    ctrl.play();
                    // ── FIX 5: Give the player time to start before seeking ──
                    setTimeout(() => {
                      if (source.currentTime) ctrl.seek(source.currentTime);
                    }, 300);
                  }
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-full shadow-2xl font-bold flex items-center gap-3 transition-all hover:scale-105 animate-pulse"
              >
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                Click to Sync with Host
              </button>
            </div>
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
        {/* REMOVED overlay so guest can click Twitch controls */}
        {source.provider === 'embed' && (
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/60 bg-black/70 px-3 py-1 rounded-full max-w-md text-center">
            Some sites block embedding. Use YouTube, Vimeo, or a direct .mp4 link for best sync.
          </p>
        )}
      </div>
    );
  },
);