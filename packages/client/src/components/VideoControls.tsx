import { useState, useRef, useCallback, memo } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, PictureInPicture2, Gauge,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VideoControlsProps {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  isFullscreen: boolean;
  isHost: boolean;
  playbackRate: number;
  pipSupported: boolean;
  onPlayPause: () => void;
  onMute: () => void;
  onVolumeChange: (v: number) => void;
  onSeek: (t: number) => void;
  onSkip: (delta: number) => void;
  onFullscreen: () => void;
  onPlaybackRate?: (rate: number) => void;
  onPip?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(s: number) {
  if (!isFinite(s)) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// ─── Component ────────────────────────────────────────────────────────────────

export const VideoControls = memo(function VideoControls({
  isPlaying, isMuted, volume, currentTime, duration,
  isFullscreen, isHost, playbackRate, pipSupported,
  onPlayPause, onMute, onVolumeChange,
  onSeek, onSkip, onFullscreen, onPlaybackRate, onPip,
}: VideoControlsProps) {
  const progress = duration ? (currentTime / duration) * 100 : 0;
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isHost) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(ratio * duration);
  }, [isHost, duration, onSeek]);

  const handleProgressHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHoverTime(ratio * duration);
  }, [duration]);

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
        <button
          onClick={() => isHost && onSkip(-10)}
          disabled={!isHost}
          className="text-white/70 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Back 10s (←)"
        >
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
        <button
          onClick={() => isHost && onSkip(10)}
          disabled={!isHost}
          className="text-white/70 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Forward 10s (→)"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        {/* Time */}
        <span className="text-xs text-white/60 font-mono tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="flex-1" />

        {/* Playback speed */}
        {isHost && onPlaybackRate && (
          <div className="relative">
            <button
              onClick={() => setShowSpeedMenu((v) => !v)}
              className="text-white/70 hover:text-white transition-colors text-xs font-mono flex items-center gap-1"
              title="Playback speed"
            >
              <Gauge className="w-3.5 h-3.5" />
              {playbackRate}x
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-full mb-2 right-0 glass-panel rounded-lg py-1 min-w-[80px] z-50">
                {SPEED_OPTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => { onPlaybackRate(r); setShowSpeedMenu(false); }}
                    className={`block w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      r === playbackRate ? 'text-accent bg-accent/10' : 'text-white/70 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {r}x
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Volume */}
        <div className="flex items-center gap-2 group/vol">
          <button onClick={onMute} className="text-white/70 hover:text-white transition-colors">
            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0} max={1} step={0.02}
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(+e.target.value)}
            className="w-16 accent-white opacity-70 hover:opacity-100 transition-opacity"
          />
        </div>

        {/* PiP */}
        {pipSupported && onPip && (
          <button onClick={onPip} className="text-white/70 hover:text-white transition-colors" title="Picture in Picture (P)">
            <PictureInPicture2 className="w-4 h-4" />
          </button>
        )}

        {/* Fullscreen */}
        <button onClick={onFullscreen} className="text-white/70 hover:text-white transition-colors" title="Fullscreen (F)">
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
});
