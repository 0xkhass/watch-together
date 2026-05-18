import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film, Users, Zap, Plus, ArrowRight, Wifi,
  Keyboard, Globe, Headphones, Lock,
} from 'lucide-react';
import { useRoom } from '../hooks/useRoom';
import { useRoomStore } from '../store/roomStore';

// ─── Floating Particles ──────────────────────────────────────────────────────

function Particles() {
  const dots = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2,
      duration: 15 + Math.random() * 25,
      delay: Math.random() * 10,
      opacity: 0.1 + Math.random() * 0.2,
    })),
  []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {dots.map((d) => (
        <motion.div
          key={d.id}
          className="absolute rounded-full bg-accent"
          style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.size, height: d.size, opacity: d.opacity }}
          animate={{ y: [0, -30, 0], x: [0, 10, 0], opacity: [d.opacity, d.opacity * 1.5, d.opacity] }}
          transition={{ duration: d.duration, delay: d.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ─── Feature Cards ───────────────────────────────────────────────────────────

const FEATURES = [
  { icon: Wifi, label: 'Real-Time Sync', desc: 'YouTube, Vimeo, Twitch & direct files' },
  { icon: Headphones, label: 'Voice & Chat', desc: 'P2P voice with live text chat' },
  { icon: Globe, label: 'Any Source', desc: 'Google Drive, HLS, MP4, and more' },
  { icon: Keyboard, label: 'Shortcuts', desc: 'Space, arrows, M, F, P keys' },
  { icon: Users, label: 'Room System', desc: 'Share a code to invite friends' },
  { icon: Zap, label: 'Free AI', desc: 'Chat summary & video suggestions' },
];

// ─── Home Page ───────────────────────────────────────────────────────────────

export function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { createRoom, joinRoom } = useRoom();
  const { username } = useRoomStore();

  const [mode, setMode] = useState<'landing' | 'create' | 'join'>(
    searchParams.get('join') ? 'join' : 'landing'
  );
  const [inputUsername, setInputUsername] = useState(username);
  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState(searchParams.get('join') || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // SEO
  useEffect(() => {
    document.title = 'Watch Together — Sync videos with friends';
  }, []);

  const handleCreate = async () => {
    if (!inputUsername.trim()) return setError('Enter your name to continue');
    setLoading(true);
    setError('');
    try {
      const { code } = await createRoom(
        inputUsername.trim(),
        roomName.trim() || undefined,
        password.trim() || undefined,
      );
      navigate(`/room/${code}`);
    } catch (err) {
      setError('Failed to create room. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!inputUsername.trim()) return setError('Enter your name to continue');
    if (!joinCode.trim()) return setError('Enter a room code');
    setLoading(true);
    setError('');
    try {
      await joinRoom(joinCode.trim().toUpperCase(), inputUsername.trim(), password.trim() || undefined);
      navigate(`/room/${joinCode.trim().toUpperCase()}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Room not found';
      if (msg === 'password_required') {
        setError('This room requires a password');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas-950 overflow-auto flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-cinema-gradient" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[300px] bg-purple-500/5 rounded-full blur-3xl" />
        <Particles />
        {/* Film grain */}
        <div className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: '200px',
          }}
        />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-4 py-16">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center mb-10"
        >
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center mb-4 shadow-glow-md">
            <Film className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold text-white tracking-tight">
            Watch <span className="text-gradient">Together</span>
          </h1>
          <p className="mt-3 text-text-secondary text-lg text-center max-w-md">
            Watch videos with friends, in perfect sync. YouTube, Twitch, Google Drive, HLS, and more.
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {mode === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-sm flex flex-col gap-3"
            >
              {/* Feature highlights */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {FEATURES.slice(0, 3).map(({ icon: Icon, label, desc }) => (
                  <motion.div
                    key={label}
                    className="glass-card p-3 text-center group hover:border-accent/30 transition-colors cursor-default"
                    whileHover={{ y: -2 }}
                  >
                    <Icon className="w-4 h-4 text-accent mx-auto mb-1.5 group-hover:scale-110 transition-transform" />
                    <span className="text-xs text-text-primary font-medium block">{label}</span>
                    <span className="text-[10px] text-text-muted block mt-0.5">{desc}</span>
                  </motion.div>
                ))}
              </div>

              <button
                onClick={() => setMode('create')}
                className="btn-primary flex items-center justify-center gap-2 py-3.5 text-base"
              >
                <Plus className="w-5 h-5" />
                Create a Room
              </button>
              <button
                onClick={() => setMode('join')}
                className="btn-ghost flex items-center justify-center gap-2 py-3.5 text-base border border-white/[0.08]"
              >
                <ArrowRight className="w-5 h-5" />
                Join with Code
              </button>

              {/* Extra features row */}
              <div className="grid grid-cols-3 gap-2 mt-3">
                {FEATURES.slice(3).map(({ icon: Icon, label }) => (
                  <motion.div
                    key={label}
                    className="glass-card p-2.5 text-center group hover:border-accent/20 transition-colors cursor-default"
                    whileHover={{ y: -1 }}
                  >
                    <Icon className="w-3.5 h-3.5 text-accent/70 mx-auto mb-1 group-hover:text-accent transition-colors" />
                    <span className="text-[10px] text-text-secondary block">{label}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {(mode === 'create' || mode === 'join') && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-sm"
            >
              <div className="glass-panel rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-5">
                  {mode === 'create' ? 'Create a Room' : 'Join a Room'}
                </h2>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">
                      Your Name
                    </label>
                    <input
                      type="text"
                      placeholder="Enter your name..."
                      value={inputUsername}
                      onChange={e => setInputUsername(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (mode === 'create' ? handleCreate() : handleJoin())}
                      maxLength={30}
                      autoFocus
                      className="input-field w-full"
                    />
                  </div>

                  {mode === 'create' && (
                    <div>
                      <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">
                        Room Name <span className="normal-case text-text-muted/60">(optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Movie Night..."
                        value={roomName}
                        onChange={e => setRoomName(e.target.value)}
                        maxLength={50}
                        className="input-field w-full"
                      />
                    </div>
                  )}

                  {mode === 'join' && (
                    <div>
                      <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">
                        Room Code
                      </label>
                      <input
                        type="text"
                        placeholder="ABC123"
                        value={joinCode}
                        onChange={e => setJoinCode(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === 'Enter' && handleJoin()}
                        maxLength={6}
                        className="input-field w-full font-mono text-center text-lg tracking-widest"
                      />
                    </div>
                  )}

                  {/* Password field (optional for create, shown for join) */}
                  <div>
                    <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Password <span className="normal-case text-text-muted/60">(optional)</span>
                    </label>
                    <input
                      type="password"
                      placeholder={mode === 'create' ? 'Set a room password...' : 'Enter room password...'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (mode === 'create' ? handleCreate() : handleJoin())}
                      maxLength={64}
                      className="input-field w-full"
                    />
                  </div>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="text-rose-400 text-sm"
                    >
                      {error}
                    </motion.p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setMode('landing'); setError(''); }}
                      className="btn-ghost flex-1"
                    >
                      Back
                    </button>
                    <button
                      onClick={mode === 'create' ? handleCreate : handleJoin}
                      disabled={loading}
                      className="btn-primary flex-1 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          {mode === 'create' ? 'Create' : 'Join'}
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="relative text-center pb-6">
        <p className="text-text-muted text-xs">
          Open source · P2P voice · Zero subscription
        </p>
      </div>
    </div>
  );
}