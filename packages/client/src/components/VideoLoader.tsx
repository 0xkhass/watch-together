import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Link2, FolderOpen, X, Play } from 'lucide-react';

interface VideoLoaderProps {
  onLoad: (url: string, name: string, type: 'url' | 'local') => void;
  onClose: () => void;
}

export function VideoLoader({ onLoad, onClose }: VideoLoaderProps) {
  const [tab, setTab] = useState<'url' | 'local'>('url');
  const [url, setUrl] = useState('');
  const [urlName, setUrlName] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUrlLoad = () => {
    if (!url.trim()) return setError('Enter a video URL');
    try {
      new URL(url); // validate
    } catch {
      return setError('Enter a valid URL');
    }
    const name = urlName.trim() || url.split('/').pop() || 'Video';
    onLoad(url.trim(), name, 'url');
    onClose();
  };

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    onLoad(blobUrl, file.name, 'local');
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="glass-panel rounded-2xl p-6 w-full max-w-md mx-4"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-white text-lg">Load Video</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-surface-800 rounded-xl mb-5">
          {(['url', 'local'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t
                  ? 'bg-surface-600 text-white shadow-sm'
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              {t === 'url' ? <Link2 className="w-3.5 h-3.5" /> : <FolderOpen className="w-3.5 h-3.5" />}
              {t === 'url' ? 'Video URL' : 'Local File'}
            </button>
          ))}
        </div>

        {tab === 'url' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">
                Video URL
              </label>
              <input
                type="url"
                placeholder="https://example.com/video.mp4"
                value={url}
                onChange={e => { setUrl(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleUrlLoad()}
                autoFocus
                className="input-field w-full text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">
                Title <span className="normal-case text-text-muted/60">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="My Movie..."
                value={urlName}
                onChange={e => setUrlName(e.target.value)}
                className="input-field w-full text-sm"
              />
            </div>
            <p className="text-xs text-text-muted">
              Supports MP4, WebM, HLS (.m3u8). CORS must be allowed by the server.
            </p>
            {error && <p className="text-rose-400 text-sm">{error}</p>}
            <button onClick={handleUrlLoad} className="btn-primary w-full flex items-center justify-center gap-2">
              <Play className="w-4 h-4" />
              Load Video
            </button>
          </div>
        )}

        {tab === 'local' && (
          <div className="space-y-3">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center cursor-pointer hover:border-accent/40 hover:bg-accent/5 transition-all group"
            >
              <FolderOpen className="w-10 h-10 text-text-muted group-hover:text-accent mx-auto mb-3 transition-colors" />
              <p className="text-text-secondary text-sm">Click to browse, or drag & drop</p>
              <p className="text-text-muted text-xs mt-1">MP4, WebM, MOV, MKV, AVI</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileLoad}
              className="hidden"
            />
            <p className="text-xs text-text-muted">
              ⚠️ Local files only sync for you. Others need the same file or a URL.
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}