import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, FolderOpen, X, Play, Loader2, Youtube, Clock, Trash2 } from 'lucide-react';
import { uploadVideo } from '../services/videoApi';
import { parseVideoUrl, providerLabel, type ParsedVideoSource } from '../utils/videoSource';

interface VideoLoaderProps {
  roomCode: string;
  userId: string;
  isHost: boolean;
  onLoad: (source: ParsedVideoSource) => void;
  onClose: () => void;
}

const EXAMPLES = [
  { label: 'YouTube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  { label: 'Vimeo', url: 'https://vimeo.com/148751763' },
  { label: 'MP4', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
  { label: 'HLS', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
];

const RECENT_KEY = 'wt_recent_videos';
const MAX_RECENT = 6;

interface RecentEntry {
  url: string;
  name: string;
  provider: string;
  timestamp: number;
}

function getRecentVideos(): RecentEntry[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecentVideo(entry: RecentEntry) {
  const recent = getRecentVideos().filter((r) => r.url !== entry.url);
  recent.unshift(entry);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

function clearRecentVideos() {
  localStorage.removeItem(RECENT_KEY);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VideoLoader({ roomCode, userId, isHost, onLoad, onClose }: VideoLoaderProps) {
  const [tab, setTab] = useState<'url' | 'local'>('url');
  const [url, setUrl] = useState('');
  const [urlName, setUrlName] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [preview, setPreview] = useState<ParsedVideoSource | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [recentVideos, setRecentVideos] = useState<RecentEntry[]>(getRecentVideos);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updatePreview = useCallback((raw: string) => {
    setUrl(raw);
    setError('');
    if (!raw.trim()) {
      setPreview(null);
      return;
    }
    const parsed = parseVideoUrl(raw, urlName || undefined);
    setPreview(parsed);
    if (!parsed) setError('Enter a valid URL');
  }, [urlName]);

  const handleUrlLoad = () => {
    const parsed = parseVideoUrl(url, urlName.trim() || undefined);
    if (!parsed) return setError('Enter a valid video URL');
    saveRecentVideo({ url: parsed.url, name: parsed.name, provider: parsed.provider, timestamp: Date.now() });
    setRecentVideos(getRecentVideos());
    onLoad(parsed);
    onClose();
  };

  const handleFileUpload = async (file: File) => {
    if (!isHost) {
      setError('Only the host can upload videos for the room');
      return;
    }

    setError('');
    setUploading(true);
    setUploadProgress(0);

    try {
      const result = await uploadVideo(file, roomCode, userId, setUploadProgress);
      const source: ParsedVideoSource = {
        provider: 'direct',
        url: result.url,
        embedUrl: result.url,
        name: result.name,
        type: 'url',
      };
      saveRecentVideo({ url: result.url, name: result.name, provider: 'direct', timestamp: Date.now() });
      setRecentVideos(getRecentVideos());
      onLoad(source);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    void handleFileUpload(file);
  };

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      setTab('local');
      setSelectedFile(file);
      void handleFileUpload(file);
      return;
    }

    // Check for dropped URL
    const text = e.dataTransfer.getData('text/plain');
    if (text) {
      setTab('url');
      updatePreview(text);
    }
  }, [updatePreview]);

  const handleClearRecent = () => {
    clearRecentVideos();
    setRecentVideos([]);
  };

  const handleLoadRecent = (entry: RecentEntry) => {
    const parsed = parseVideoUrl(entry.url, entry.name);
    if (parsed) {
      onLoad(parsed);
      onClose();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !uploading && onClose()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className={`glass-panel rounded-2xl p-6 w-full max-w-md mx-4 transition-colors ${isDragOver ? 'ring-2 ring-accent' : ''}`}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-white text-lg">Load Video</h3>
          <button type="button" onClick={onClose} disabled={uploading} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* Drag overlay */}
        <AnimatePresence>
          {isDragOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-4 rounded-xl border-2 border-dashed border-accent bg-accent/10 flex items-center justify-center z-10"
            >
              <p className="text-accent font-medium">Drop video file or URL here</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-1 p-1 bg-surface-800 rounded-xl mb-5">
          {(['url', 'local'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { if (!uploading) { setTab(t); setError(''); } }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-surface-600 text-white' : 'text-text-secondary hover:text-white'
              }`}
            >
              {t === 'url' ? <Link2 className="w-3.5 h-3.5" /> : <FolderOpen className="w-3.5 h-3.5" />}
              {t === 'url' ? 'Link' : 'Upload'}
            </button>
          ))}
        </div>

        {tab === 'url' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">
                Video link
              </label>
              <input
                type="url"
                placeholder="YouTube, Vimeo, Twitch, Google Drive, or .mp4 URL"
                value={url}
                onChange={(e) => updatePreview(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUrlLoad()}
                autoFocus
                disabled={uploading}
                className="input-field w-full text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">
                Title <span className="normal-case opacity-60">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="Movie night…"
                value={urlName}
                onChange={(e) => {
                  setUrlName(e.target.value);
                  if (url.trim()) updatePreview(url);
                }}
                disabled={uploading}
                className="input-field w-full text-sm"
              />
            </div>

            {preview && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20 text-xs text-accent">
                <Youtube className="w-4 h-4 flex-shrink-0" />
                <span>{providerLabel(preview.provider)} — synced playback</span>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => updatePreview(ex.url)}
                  className="text-[10px] px-2 py-1 rounded-full bg-surface-800 text-text-muted hover:text-white transition-colors"
                >
                  {ex.label}
                </button>
              ))}
            </div>

            <p className="text-xs text-text-muted">
              YouTube, Vimeo, Twitch, Streamable, Google Drive, HLS (.m3u8), and direct MP4/WebM supported.
            </p>
            {error && <p className="text-rose-400 text-sm">{error}</p>}
            <button type="button" onClick={handleUrlLoad} disabled={uploading || !preview} className="btn-primary w-full flex items-center justify-center gap-2">
              <Play className="w-4 h-4" />
              Load Video
            </button>
          </div>
        )}

        {tab === 'local' && (
          <div className="space-y-3">
            <motion.div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                uploading ? 'cursor-wait border-accent/40' : 'cursor-pointer border-white/10 hover:border-accent/40'
              }`}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-10 h-10 text-accent mx-auto mb-3 animate-spin" />
                  <p className="text-sm text-text-secondary">Uploading… {uploadProgress}%</p>
                  <div className="w-full h-1.5 bg-surface-800 rounded-full mt-3 overflow-hidden">
                    <motion.div
                      className="h-full bg-accent rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </>
              ) : selectedFile ? (
                <>
                  <FolderOpen className="w-10 h-10 text-accent mx-auto mb-3" />
                  <p className="text-sm text-white font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-text-muted mt-1">{formatBytes(selectedFile.size)}</p>
                </>
              ) : (
                <>
                  <FolderOpen className="w-10 h-10 text-text-muted mx-auto mb-3" />
                  <p className="text-text-secondary text-sm">Click or drag & drop to upload</p>
                  <p className="text-text-muted text-xs mt-1">MP4, WebM, MKV, AVI supported</p>
                </>
              )}
            </motion.div>
            <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileSelect} className="hidden" />
            {error && <p className="text-rose-400 text-sm">{error}</p>}
          </div>
        )}

        {/* Recently Played */}
        {recentVideos.length > 0 && (
          <div className="mt-5 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <Clock className="w-3 h-3" />
                Recently played
              </div>
              <button
                type="button"
                onClick={handleClearRecent}
                className="text-[10px] text-text-muted hover:text-rose-400 flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-2.5 h-2.5" />
                Clear
              </button>
            </div>
            <div className="space-y-1">
              {recentVideos.slice(0, 4).map((entry, i) => (
                <button
                  key={`${entry.url}-${i}`}
                  type="button"
                  onClick={() => handleLoadRecent(entry)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group"
                >
                  <p className="text-sm text-text-primary truncate group-hover:text-white">{entry.name}</p>
                  <p className="text-[10px] text-text-muted truncate">{providerLabel(entry.provider as any)}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
