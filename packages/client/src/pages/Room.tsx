import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, MessageSquare,
  Headphones, LogOut, Copy, Check, Link, Film, Bot,
  Wifi, WifiOff, Crown, Loader2, RefreshCw,
  Maximize, Minimize, Volume2, VolumeX,
} from 'lucide-react';
import { useRoomStore } from '../store/roomStore';
import { useRoom } from '../hooks/useRoom';
import { useSync } from '../hooks/useSync';
import { useEmbedSync, type EmbedPlayerController } from '../hooks/useEmbedSync';
import { useWebRTC } from '../hooks/useWebRtc';
import { ChatPanel } from '../components/ChatPanel';
import { VoiceChat } from '../components/VoiceChat';
import { VideoLoader } from '../components/VideoLoader';
import { EmbedPlayer } from '../components/EmbedPlayer';
import { AiAssistant } from '../components/AiAssistant';
import { MemberPanel } from '../components/MemberPanel';
import { VideoControls } from '../components/VideoControls';
import { ReactionOverlay } from '../components/ReactionOverlay';
import { EmojiPicker } from '../components/EmojiPicker';
import { STORAGE_KEYS, VideoProvider } from '../types';
import { notifyVideoLoaded, notifyPlayback } from '../utils/roomNotifications';
import { parseVideoUrl, isEmbedProvider, type ParsedVideoSource } from '../utils/videoSource';
import { playbackFromRoomVideo } from '../utils/playbackFromRoom';
import { isHlsUrl, attachHls } from '../utils/hlsLoader';

// ─── Components extracted to separate files ──────────────────────────────────
// ReactionOverlay → ../components/ReactionOverlay.tsx
// VideoControls  → ../components/VideoControls.tsx
// EmojiPicker    → ../components/EmojiPicker.tsx

// ─── Member List ──────────────────────────────────────────────────────────────

function MemberList({ members, hostId, currentUserId }: {
  members: { id: string; username: string; avatarColor: string; isHost: boolean }[];
  hostId: string;
  currentUserId: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {members.slice(0, 5).map(m => (
        <div key={m.id} className="relative group">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white border-2 border-transparent"
            style={{ backgroundColor: m.avatarColor, borderColor: m.id === currentUserId ? '#6366f1' : 'transparent' }}
            title={m.username}
          >
            {m.username[0]?.toUpperCase()}
          </div>
          {m.id === hostId && (
            <Crown className="absolute -top-1 -right-1 w-2.5 h-2.5 text-yellow-400" />
          )}
          {/* Tooltip */}
          <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-surface-700 text-xs text-white px-2 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
            {m.username}{m.id === currentUserId ? ' (you)' : ''}
          </div>
        </div>
      ))}
      {members.length > 5 && (
        <div className="w-7 h-7 rounded-full bg-surface-700 flex items-center justify-center text-xs text-text-muted">
          +{members.length - 5}
        </div>
      )}
    </div>
  );
}


// ─── Room Page ────────────────────────────────────────────────────────────────

export function Room() {
  const { code: routeCode } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const {
    room, userId, username, isChatOpen, isVoiceChatOpen, isMemberPanelOpen,
    toggleChat, toggleVoiceChat, toggleMemberPanel, reactions, isConnected, latency, messages,
    soundEnabled,
  } = useRoomStore();

  const { socket, joinRoom, leaveRoom, sendMessage, sendReaction } = useRoom();
  const [isRestoring, setIsRestoring] = useState(!room);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Video state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playback, setPlayback] = useState<ParsedVideoSource | null>(() =>
    playbackFromRoomVideo(room?.video),
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(() => {
    const p = playbackFromRoomVideo(room?.video);
    return p?.provider === 'direct' ? p.url : null;
  });
  const [videoName, setVideoName] = useState<string | null>(room?.video?.name || null);
  const [showVideoLoader, setShowVideoLoader] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const embedControllerRef = useRef<EmbedPlayerController | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isTheater, setIsTheater] = useState(false);
  const [seekIndicator, setSeekIndicator] = useState<{ side: 'left' | 'right'; key: number } | null>(null);
  const hlsCleanupRef = useRef<(() => void) | null>(null);
  const pipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document;
  const isHost = room?.hostId === userId;
  const isEmbedSyncable =
    playback?.provider === 'youtube' || playback?.provider === 'vimeo';
  const showDirectVideo = playback?.provider === 'direct';

  // Sync hook (direct MP4 / uploaded files)
  const { emitPlay, emitPause, emitSeek, emitSeekImmediate, emitLoad, requestSync } = useSync({
    socket,
    videoRef,
    isHost,
    videoUrl: showDirectVideo ? videoUrl : null,
    latency,
    onSyncingChange: setIsSyncing,
    onVideoLoad: (url, name, _type, meta) => {
      const parsed = meta?.provider
        ? {
            provider: meta.provider as VideoProvider,
            url,
            embedUrl: meta.embedUrl || url,
            videoId: meta.embedId,
            name,
            type: 'url' as const,
          }
        : parseVideoUrl(url, name);
      if (parsed) {
        setPlayback(parsed);
        setVideoUrl(parsed.provider === 'direct' ? parsed.url : null);
        setVideoName(name);
      }
    },
    onVideoLoadedNotify: (name) => {
      if (!isHost) notifyVideoLoaded(name, false);
    },
    onPlaybackNotify: (playing) => {
      if (!isHost) notifyPlayback(playing);
    },
  });

  const embedSync = useEmbedSync({
    socket,
    controllerRef: embedControllerRef,
    isHost,
    active: !!playback && isEmbedSyncable,
    latency,
    onSyncingChange: setIsSyncing,
    onPlaybackNotify: (playing) => {
      if (!isHost) notifyPlayback(playing);
    },
  });

  // WebRTC
  const {
    isInVoice, isMuted: voiceMuted, isDeafened, voiceUsers, speakingUsers,
    joinVoice, leaveVoice, toggleMute, toggleDeafen, setPeerVolume,
  } = useWebRTC(socket, userId);

  // Re-join after refresh (in-memory room state is lost; userId/username persist)
  useEffect(() => {
    if (room) {
      setIsRestoring(false);
      return;
    }

    const code = (routeCode || sessionStorage.getItem(STORAGE_KEYS.ROOM_CODE) || '').toUpperCase();
    if (!code) {
      navigate('/', { replace: true });
      return;
    }

    if (!username.trim()) {
      navigate(`/?join=${code}`, { replace: true });
      return;
    }

    setIsRestoring(true);

    let cancelled = false;

    joinRoom(code, username.trim())
      .catch(() => {
        if (!cancelled) navigate(`/?join=${code}`, { replace: true });
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, [room, routeCode, username, joinRoom, navigate]);

  useEffect(() => {
    if (!room?.video?.url) return;
    const p = playbackFromRoomVideo(room.video);
    if (p) {
      setPlayback(p);
      setVideoName(p.name);
      setVideoUrl(p.provider === 'direct' ? p.url : null);
    }
  }, [room?.video?.url, room?.video?.name, room?.video?.provider]);
  // Video event listeners (re-bind when video element mounts)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration);
    const onVolumeChange = () => { setVolume(video.volume); setIsMuted(video.muted); };
    const onWaiting = () => setIsVideoLoading(true);
    const onCanPlay = () => setIsVideoLoading(false);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
    };
  }, [videoUrl]);

  // Update video src when url changes (with HLS support)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    // Clean up previous HLS instance
    hlsCleanupRef.current?.();
    hlsCleanupRef.current = null;

    setIsVideoLoading(true);

    if (isHlsUrl(videoUrl)) {
      // Lazy-load hls.js for .m3u8 streams
      void attachHls(video, videoUrl).then((cleanup) => {
        hlsCleanupRef.current = cleanup;
      });
    } else {
      video.src = videoUrl;
      video.load();
    }

    if (!isHost) requestSync();

    return () => {
      hlsCleanupRef.current?.();
      hlsCleanupRef.current = null;
    };
  }, [videoUrl, isHost, requestSync]);

  // Fullscreen listener
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) setShowControls(true);
  }, [isPlaying]);

  // Actions
  const handlePlayPause = useCallback(() => {
    if (!isHost) return;
    if (isEmbedSyncable && embedControllerRef.current) {
      const ctrl = embedControllerRef.current;
      void Promise.resolve(ctrl.getCurrentTime()).then((t) => {
        if (document.hidden) return;
        // Host toggles via YT controls; emit on state callbacks too
        void t;
      });
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      emitPlay(video.currentTime);
    } else {
      video.pause();
      emitPause(video.currentTime);
    }
  }, [isHost, isEmbedSyncable, emitPlay, emitPause]);

  const handleSeek = useCallback((t: number) => {
    const video = videoRef.current;
    if (!video || !isHost) return;
    video.currentTime = t;
    emitSeekImmediate(t);
  }, [isHost, emitSeekImmediate]);

  const handleSkip = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
    video.currentTime = newTime;
    if (isHost) emitSeek(newTime);
  }, [isHost, emitSeek]);

  const handleVolumeChange = useCallback((v: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = v;
    video.muted = v === 0;
  }, []);

  const handleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, []);

  const handleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  const handleVideoLoad = useCallback((source: ParsedVideoSource) => {
    setPlayback(source);
    setVideoName(source.name);
    setVideoUrl(source.provider === 'direct' ? source.url : null);
    if (isHost) {
      emitLoad(source.url, source.name, source.type, {
        provider: source.provider,
        embedId: source.videoId,
        embedUrl: source.embedUrl,
      });
      notifyVideoLoaded(source.name, true);
    }
  }, [isHost, emitLoad]);

  const handleCopyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    if (!room) return;
    navigator.clipboard.writeText(`${window.location.origin}?join=${room.code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReaction = (emoji: string) => {
    sendReaction(emoji, 0.3 + Math.random() * 0.4, 0.6 + Math.random() * 0.3);
    setShowEmojiPicker(false);
  };

  const handlePlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video || !isHost) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
  }, [isHost]);

  const handlePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('[PiP] Not supported or denied:', err);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'arrowleft':
          e.preventDefault();
          if (isHost) handleSkip(-10);
          break;
        case 'arrowright':
          e.preventDefault();
          if (isHost) handleSkip(10);
          break;
        case 'm':
          handleMute();
          break;
        case 'f':
          handleFullscreen();
          break;
        case 'p':
          void handlePip();
          break;
        case 't':
          setIsTheater(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePlayPause, handleSkip, handleMute, handleFullscreen, handlePip, isHost]);

  if (!room) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-canvas-950">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 className="w-10 h-10 text-accent" />
        </motion.div>
        <p className="text-text-secondary">
          {isRestoring ? 'Reconnecting to room…' : 'Loading…'}
        </p>
      </div>
    );
  }

  const members = room.members;

  return (
    <div className={`flex h-screen bg-canvas-950 overflow-hidden transition-all duration-300 ${isTheater ? 'flex-col' : ''}`}>
      {/* ── Main Area ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top Bar */}
        <div className={`flex items-center gap-3 px-4 border-b border-white/[0.06] bg-surface-900/50 backdrop-blur-sm flex-shrink-0 transition-all duration-300 ${isTheater ? 'py-1.5' : 'py-2.5'}`}>
          {/* Room info */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
              <Film className="w-3.5 h-3.5 text-accent" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white truncate">{room.name || 'Watch Together'}</span>
                {videoName && (
                  <span className="text-xs text-text-muted truncate hidden sm:block">· {videoName}</span>
                )}
              </div>
            </div>
          </div>

          {/* Room code */}
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/10 border border-accent/20 hover:bg-accent/20 transition-colors group ml-1 flex-shrink-0"
          >
            <span className="font-mono text-xs font-bold text-accent tracking-widest">{room.code}</span>
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-accent/60 group-hover:text-accent transition-colors" />}
          </button>

          <div className="flex-1" />

          {/* Members */}
          <MemberList members={members} hostId={room.hostId} currentUserId={userId} />

          {/* Connection status */}
          <motion.div className="flex items-center gap-1.5 ml-2">
            {isConnected ? (
              <div
                className={`flex items-center gap-1 text-xs ${
                  latency < 100 ? 'text-green-400' : latency < 300 ? 'text-yellow-400' : 'text-rose-400'
                }`}
                title={`Latency: ${latency}ms${latency < 100 ? ' (excellent)' : latency < 300 ? ' (good)' : ' (poor)'}`}
              >
                <Wifi className="w-3 h-3" />
                <span className="hidden sm:block tabular-nums">{latency}ms</span>
              </div>
            ) : (
              <motion.div
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="flex items-center gap-1 text-xs text-rose-400"
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span className="hidden sm:block">Reconnecting…</span>
              </motion.div>
            )}
          </motion.div>

          {/* Share */}
          <button onClick={handleCopyLink} className="btn-ghost px-2 py-1.5 text-xs flex items-center gap-1.5 ml-1">
            <Link className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Invite</span>
          </button>

          {/* Leave */}
          <button onClick={leaveRoom} className="btn-danger px-2.5 py-1.5 text-xs flex items-center gap-1.5">
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Leave</span>
          </button>
        </div>

        {/* Video Container */}
        <div className="flex-1 flex items-center justify-center bg-black relative min-h-0" ref={containerRef}>
          {playback ? (
            <>
              {showDirectVideo && videoUrl ? (
                <video
                  ref={videoRef}
                  className="w-full h-full object-contain"
                  onMouseMove={resetControlsTimer}
                  onClick={handlePlayPause}
                  onDoubleClick={(e) => {
                    if (!isHost) return;
                    const rect = (e.currentTarget as HTMLVideoElement).getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const side = x < rect.width / 2 ? 'left' : 'right';
                    handleSkip(side === 'left' ? -10 : 10);
                    setSeekIndicator({ side, key: Date.now() });
                    setTimeout(() => setSeekIndicator(null), 600);
                  }}
                  playsInline
                />
              ) : isEmbedProvider(playback.provider) ? (
                <EmbedPlayer
                  ref={embedControllerRef}
                  source={playback}
                  isHost={isHost}
                  onPlay={() => { if (isHost && isEmbedSyncable) void embedSync.emitPlay(); }}
                  onPause={() => { if (isHost && isEmbedSyncable) void embedSync.emitPause(); }}
                  onTimeUpdate={(t, d) => {
                    setCurrentTime(t);
                    setDuration(d);
                  }}
                />
              ) : null}
              {/* Reaction overlay */}
              <ReactionOverlay reactions={reactions} />

              {/* Loading overlay */}
              <AnimatePresence>
                {(isVideoLoading || isSyncing) && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] pointer-events-none z-10"
                  >
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/70 text-white/80 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin text-accent" />
                      {isSyncing ? 'Syncing with host…' : 'Loading video…'}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Double-click seek indicator */}
              <AnimatePresence>
                {seekIndicator && (
                  <motion.div
                    key={seekIndicator.key}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    className={`absolute top-1/2 -translate-y-1/2 pointer-events-none z-20 ${
                      seekIndicator.side === 'left' ? 'left-[15%]' : 'right-[15%]'
                    }`}
                  >
                    <div className="bg-black/70 backdrop-blur-sm text-white text-lg font-bold px-4 py-2 rounded-full">
                      {seekIndicator.side === 'left' ? '−10s' : '+10s'}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Controls overlay */}
              {showDirectVideo && (
                <motion.div
                  initial={false}
                  animate={{ opacity: showControls ? 1 : 0 }}
                  transition={{ duration: 0.3 }}
                  onMouseMove={resetControlsTimer}
                  className="absolute inset-0 pointer-events-none"
                >
                  <div className="pointer-events-auto">
                    <VideoControls
                      isPlaying={isPlaying}
                      isMuted={isMuted}
                      volume={volume}
                      currentTime={currentTime}
                      duration={duration}
                      isFullscreen={isFullscreen}
                      isHost={isHost}
                      playbackRate={playbackRate}
                      pipSupported={pipSupported}
                      onPlayPause={handlePlayPause}
                      onMute={handleMute}
                      onVolumeChange={handleVolumeChange}
                      onSeek={handleSeek}
                      onSkip={handleSkip}
                      onFullscreen={handleFullscreen}
                      onPlaybackRate={handlePlaybackRate}
                      onPip={handlePip}
                    />
                  </div>
                </motion.div>
              )}

              {/* Guest overlay when not host */}
              {!isHost && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-4 left-1/2 -translate-x-1/2 z-20"
                >
                  <motion.div className="flex items-center gap-1.5 bg-black/60 text-white/70 text-xs px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
                    {isSyncing ? (
                      <RefreshCw className="w-3 h-3 animate-spin text-accent" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    )}
                    {isSyncing ? 'Syncing…' : 'Following host'}
                  </motion.div>
                </motion.div>
              )}
            </>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center gap-6 text-center px-8">
              <div className="w-20 h-20 rounded-2xl bg-surface-800 border border-white/[0.06] flex items-center justify-center">
                <Film className="w-10 h-10 text-text-muted" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">No video loaded</h3>
                <p className="text-text-muted text-sm">
                  {isHost ? 'Load a video to start watching together.' : 'Waiting for the host to load a video...'}
                </p>
              </div>
              {isHost && (
                <button
                  onClick={() => setShowVideoLoader(true)}
                  className="btn-primary flex items-center gap-2"
                >
                  <Film className="w-4 h-4" />
                  Load Video
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-t border-white/[0.06] bg-surface-900/30 flex-shrink-0">
          {/* Video loader (host only) */}
          {isHost && (
            <button
              onClick={() => setShowVideoLoader(true)}
              className="btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5"
            >
              <Film className="w-3.5 h-3.5" />
              {videoUrl ? 'Change Video' : 'Load Video'}
            </button>
          )}

          {/* Theater mode */}
          <button
            onClick={() => setIsTheater(v => !v)}
            className={`btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5 ${isTheater ? 'text-accent bg-accent/10' : ''}`}
            title="Theater mode (T)"
          >
            {isTheater ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            <span className="hidden sm:block">{isTheater ? 'Exit Theater' : 'Theater'}</span>
          </button>

          {/* Sound toggle */}
          <button
            onClick={() => useRoomStore.getState().toggleSound()}
            className={`btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5 ${!soundEnabled ? 'text-rose-400' : ''}`}
            title={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          <div className="flex-1" />

          {/* Emoji reactions */}
          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker(v => !v)}
              className="btn-ghost px-3 py-1.5 text-sm"
            >
              🎭
            </button>
            <AnimatePresence>
              {showEmojiPicker && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full mb-2 right-0"
                >
                  <EmojiPicker onPick={handleReaction} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Chat toggle */}
          <button
            onClick={toggleChat}
            className={`btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5 ${isChatOpen ? 'text-accent bg-accent/10' : ''}`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Chat</span>
          </button>

          {/* AI assistant */}
          <button
            type="button"
            onClick={() => setIsAiOpen((v) => !v)}
            className={`btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5 ${isAiOpen ? 'text-violet-400 bg-violet-500/10' : ''}`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span className="hidden sm:block">AI</span>
          </button>

          {/* Voice toggle */}
          <button
            type="button"
            onClick={toggleVoiceChat}
            className={`btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5 ${isVoiceChatOpen ? 'text-accent bg-accent/10' : ''} ${isInVoice ? 'text-green-400 bg-green-400/10' : ''}`}
          >
            <Headphones className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Voice</span>
            {isInVoice && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
          </button>

          {/* Members toggle */}
          <button
            onClick={toggleMemberPanel}
            className={`btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5 ${isMemberPanelOpen ? 'text-accent bg-accent/10' : ''}`}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden sm:block">{members.length}</span>
          </button>
        </div>
      </div>

      {/* ── Sidebar ── */}
      <AnimatePresence initial={false}>
        {!isTheater && (isChatOpen || isVoiceChatOpen || isMemberPanelOpen || isAiOpen) && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col border-l border-white/[0.06] overflow-hidden flex-shrink-0"
          >
            <div className="flex flex-col h-full p-2 gap-2 w-[300px] min-w-[280px] max-w-[90vw]">
              {isMemberPanelOpen && (
                <div className={`${isChatOpen || isVoiceChatOpen ? 'flex-none h-56' : 'flex-1 min-h-0'}`}>
                  <MemberPanel
                    members={members}
                    hostId={room.hostId}
                    currentUserId={userId}
                    speakingUserIds={speakingUsers}
                    onClose={toggleMemberPanel}
                  />
                </div>
              )}
              {isVoiceChatOpen && (
                <div className={`${isChatOpen ? 'flex-none h-64' : 'flex-1'}`}>
                  <VoiceChat
                    isInVoice={isInVoice}
                    isMuted={voiceMuted}
                    isDeafened={isDeafened}
                    voiceUsers={voiceUsers}
                    speakingUsers={speakingUsers}
                    onJoin={joinVoice}
                    onLeave={leaveVoice}
                    onToggleMute={toggleMute}
                    onToggleDeafen={toggleDeafen}
                    onPeerVolume={setPeerVolume}
                    onClose={toggleVoiceChat}
                  />
                </div>
              )}
              {isAiOpen && (
                <div className={`${isChatOpen ? 'flex-none h-72' : 'flex-1 min-h-0'}`}>
                  <AiAssistant
                    messages={messages}
                    roomName={room.name}
                    videoName={videoName}
                    memberCount={members.length}
                    onClose={() => setIsAiOpen(false)}
                  />
                </div>
              )}
              {isChatOpen && (
                <div className="flex-1 min-h-0">
                  <ChatPanel socket={socket} onSend={sendMessage} onClose={toggleChat} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showVideoLoader && room && (
          <VideoLoader
            roomCode={room.code}
            userId={userId}
            isHost={isHost}
            onLoad={handleVideoLoad}
            onClose={() => setShowVideoLoader(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}