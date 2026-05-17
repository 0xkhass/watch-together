import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Settings, Users, MessageSquare,
  Headphones, LogOut, Copy, Check, Link, Film,
  ChevronLeft, ChevronRight, Wifi, WifiOff, Crown,
} from 'lucide-react';
import { useRoomStore } from '../store/roomStore';
import { useRoom } from '../hooks/useRoom';
import { useSync } from '../hooks/useSync';
import { useWebRTC } from '../hooks/useWebRtc';
import { ChatPanel } from '../components/ChatPanel';
import { VoiceChat } from '../components/VoiceChat';
import { VideoLoader } from '../components/VideoLoader';
import { Reaction } from '../types';

// ─── Reaction Overlay ─────────────────────────────────────────────────────────

function ReactionOverlay({ reactions }: { reactions: Reaction[] }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <AnimatePresence>
        {reactions.map(r => (
          <motion.div
            key={r.id}
            initial={{ opacity: 1, y: 0, scale: 0.5 }}
            animate={{ opacity: 0, y: -120, scale: 1.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ left: `${r.x * 100}%`, bottom: `${(1 - r.y) * 100}%` }}
            className="absolute text-3xl select-none filter drop-shadow-lg"
          >
            {r.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

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

// ─── Video Controls ───────────────────────────────────────────────────────────

interface VideoControlsProps {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  isFullscreen: boolean;
  isHost: boolean;
  onPlayPause: () => void;
  onMute: () => void;
  onVolumeChange: (v: number) => void;
  onSeek: (t: number) => void;
  onSkip: (delta: number) => void;
  onFullscreen: () => void;
}

function formatTime(s: number) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function VideoControls({
  isPlaying, isMuted, volume, currentTime, duration,
  isFullscreen, isHost, onPlayPause, onMute, onVolumeChange,
  onSeek, onSkip, onFullscreen,
}: VideoControlsProps) {
  const progress = duration ? (currentTime / duration) * 100 : 0;
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isHost) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(ratio * duration);
  };

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHoverTime(ratio * duration);
  };

  return (
    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pt-16 pb-4 px-4">
      {/* Progress Bar */}
      <div
        ref={progressRef}
        className={`relative h-1 rounded-full bg-white/20 mb-4 group/progress ${isHost ? 'cursor-pointer' : 'cursor-default'}`}
        onClick={handleProgressClick}
        onMouseMove={handleProgressHover}
        onMouseLeave={() => setHoverTime(null)}
      >
        {/* Buffered */}
        <div className="absolute inset-y-0 left-0 bg-white/10 rounded-full" style={{ width: `${Math.min(progress + 10, 100)}%` }} />
        {/* Progress */}
        <div
          className="absolute inset-y-0 left-0 bg-accent rounded-full transition-all duration-100 group-hover/progress:h-1.5 -translate-y-px group-hover/progress:translate-y-0"
          style={{ width: `${progress}%` }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover/progress:opacity-100 transition-opacity"
          style={{ left: `calc(${progress}% - 6px)` }}
        />
        {/* Hover tooltip */}
        {hoverTime !== null && isHost && (
          <div
            className="absolute -top-8 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded -translate-x-1/2 pointer-events-none"
            style={{ left: `${(hoverTime / duration) * 100}%` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Skip back */}
        <button onClick={() => onSkip(-10)} className="text-white/70 hover:text-white transition-colors" title="Back 10s">
          <SkipBack className="w-4 h-4" />
        </button>

        {/* Play/Pause */}
        <button
          onClick={onPlayPause}
          disabled={!isHost}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
        </button>

        {/* Skip forward */}
        <button onClick={() => onSkip(10)} className="text-white/70 hover:text-white transition-colors" title="Forward 10s">
          <SkipForward className="w-4 h-4" />
        </button>

        {/* Time */}
        <span className="text-xs text-white/60 font-mono tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="flex-1" />

        {/* Volume */}
        <div className="flex items-center gap-2 group/vol">
          <button onClick={onMute} className="text-white/70 hover:text-white transition-colors">
            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0} max={1} step={0.02}
            value={isMuted ? 0 : volume}
            onChange={e => onVolumeChange(+e.target.value)}
            className="w-16 accent-white opacity-70 hover:opacity-100 transition-opacity"
          />
        </div>

        {/* Fullscreen */}
        <button onClick={onFullscreen} className="text-white/70 hover:text-white transition-colors">
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────────

const EMOJIS = ['❤️', '😂', '😮', '👏', '🔥', '😭', '🎉', '💯'];

function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="flex gap-1 p-1.5 glass-panel rounded-xl">
      {EMOJIS.map(e => (
        <button
          key={e}
          onClick={() => onPick(e)}
          className="w-8 h-8 flex items-center justify-center text-lg hover:scale-125 transition-transform"
        >
          {e}
        </button>
      ))}
    </div>
  );
}

// ─── Room Page ────────────────────────────────────────────────────────────────

export function Room() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const {
    room, userId, isChatOpen, isVoiceChatOpen,
    toggleChat, toggleVoiceChat, reactions, isConnected, latency,
  } = useRoomStore();

  const { socket, leaveRoom, sendMessage, sendReaction } = useRoom();
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
  const [videoUrl, setVideoUrl] = useState<string | null>(room?.video?.url || null);
  const [videoName, setVideoName] = useState<string | null>(room?.video?.name || null);
  const [showVideoLoader, setShowVideoLoader] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const isHost = room?.hostId === userId;

  // Sync hook
  const { emitPlay, emitPause, emitSeek, emitLoad } = useSync({
    socket,
    videoRef,
    isHost,
    onVideoLoad: (url, name) => {
      setVideoUrl(url);
      setVideoName(name);
    },
  });

  // WebRTC
  const { isInVoice, isMuted: voiceMuted, voiceUsers, speakingUsers, joinVoice, leaveVoice, toggleMute } = useWebRTC(socket, userId);

  // Redirect if no room
  useEffect(() => {
    if (!room) navigate('/');
  }, [room, navigate]);


  useEffect(() => {
    if (room?.video?.url && !videoUrl) {
      setVideoUrl(room.video.url);
      setVideoName(room.video.name);
    }
  }, [room?.video?.url, room?.video?.name]);
  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration);
    const onVolumeChange = () => { setVolume(video.volume); setIsMuted(video.muted); };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('volumechange', onVolumeChange);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('volumechange', onVolumeChange);
    };
  }, []);

  // Update video src when url changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    video.src = videoUrl;
    video.load();
  }, [videoUrl]);

  // Fullscreen listener
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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
    const video = videoRef.current;
    if (!video || !isHost) return;
    if (video.paused) {
      video.play();
      emitPlay(video.currentTime);
    } else {
      video.pause();
      emitPause(video.currentTime);
    }
  }, [isHost, emitPlay, emitPause]);

  const handleSeek = useCallback((t: number) => {
    const video = videoRef.current;
    if (!video || !isHost) return;
    video.currentTime = t;
    emitSeek(t);
  }, [isHost, emitSeek]);

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

  const handleVideoLoad = useCallback((url: string, name: string, type: 'url' | 'local') => {
    setVideoUrl(url);
    setVideoName(name);
    if (isHost) emitLoad(url, name, type);
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

  if (!room) return null;

  const members = room.members;

  return (
    <div className="flex h-screen bg-canvas-950 overflow-hidden">
      {/* ── Main Area ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top Bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-surface-900/50 backdrop-blur-sm flex-shrink-0">
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
          <div className="flex items-center gap-1.5 ml-2">
            {isConnected ? (
              <div className="flex items-center gap-1 text-xs text-green-400">
                <Wifi className="w-3 h-3" />
                <span className="hidden sm:block">{latency}ms</span>
              </div>
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-rose-400" />
            )}
          </div>

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
          {videoUrl ? (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                onMouseMove={resetControlsTimer}
                onClick={handlePlayPause}
                playsInline
              />
              {/* Reaction overlay */}
              <ReactionOverlay reactions={reactions} />

              {/* Controls overlay */}
              <motion.div
                initial={false}
                animate={{ opacity: showControls ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                onMouseMove={resetControlsTimer}
                className="absolute inset-0"
              >
                <VideoControls
                  isPlaying={isPlaying}
                  isMuted={isMuted}
                  volume={volume}
                  currentTime={currentTime}
                  duration={duration}
                  isFullscreen={isFullscreen}
                  isHost={isHost}
                  onPlayPause={handlePlayPause}
                  onMute={handleMute}
                  onVolumeChange={handleVolumeChange}
                  onSeek={handleSeek}
                  onSkip={handleSkip}
                  onFullscreen={handleFullscreen}
                />
              </motion.div>

              {/* Guest overlay when not host */}
              {!isHost && showControls && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2">
                  <div className="bg-black/60 text-white/60 text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
                    Syncing with host
                  </div>
                </div>
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

          {/* Voice toggle */}
          <button
            onClick={toggleVoiceChat}
            className={`btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5 ${isVoiceChatOpen ? 'text-accent bg-accent/10' : ''} ${isInVoice ? 'text-green-400 bg-green-400/10' : ''}`}
          >
            <Headphones className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Voice</span>
            {isInVoice && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
          </button>

          {/* Members toggle */}
          <button
            onClick={() => setSidebarCollapsed(v => !v)}
            className="btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden sm:block">{members.length}</span>
          </button>
        </div>
      </div>

      {/* ── Sidebar ── */}
      <AnimatePresence initial={false}>
        {(isChatOpen || isVoiceChatOpen) && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col border-l border-white/[0.06] overflow-hidden flex-shrink-0"
          >
            <div className="flex flex-col h-full p-2 gap-2 w-[300px]">
              {isVoiceChatOpen && (
                <div className={`${isChatOpen ? 'flex-none h-64' : 'flex-1'}`}>
                  <VoiceChat
                    isInVoice={isInVoice}
                    isMuted={voiceMuted}
                    voiceUsers={voiceUsers}
                    speakingUsers={speakingUsers}
                    onJoin={joinVoice}
                    onLeave={leaveVoice}
                    onToggleMute={toggleMute}
                    onClose={toggleVoiceChat}
                  />
                </div>
              )}
              {isChatOpen && (
                <div className="flex-1 min-h-0">
                  <ChatPanel onSend={sendMessage} onClose={toggleChat} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showVideoLoader && (
          <VideoLoader
            onLoad={handleVideoLoad}
            onClose={() => setShowVideoLoader(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}