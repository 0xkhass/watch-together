import { motion } from 'framer-motion';
import { Crown, Mic, MicOff, X } from 'lucide-react';
import { Member } from '../types';

interface MemberPanelProps {
  members: Member[];
  hostId: string;
  currentUserId: string;
  speakingUserIds?: Set<string>;
  onClose: () => void;
}

export function MemberPanel({
  members,
  hostId: _hostId,
  currentUserId,
  speakingUserIds,
  onClose,
}: MemberPanelProps) {
  const sorted = [...members].sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    if (a.id === currentUserId) return -1;
    if (b.id === currentUserId) return 1;
    return a.username.localeCompare(b.username);
  });

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      className="flex flex-col h-full glass-panel rounded-xl overflow-hidden"
    >
      <motion.div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <span className="font-medium text-sm text-white">
          Members <span className="text-text-muted">({members.length})</span>
        </span>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-text-secondary"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </motion.div>

      <motion.div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sorted.map((m) => {
          const isSpeaking = speakingUserIds?.has(m.id);
          const isYou = m.id === currentUserId;
          return (
            <motion.div
              key={m.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                isSpeaking ? 'bg-green-500/10 ring-1 ring-green-500/30' : 'hover:bg-white/[0.04]'
              }`}
            >
              <div className="relative flex-shrink-0">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                  style={{ backgroundColor: m.avatarColor }}
                >
                  {m.username[0]?.toUpperCase()}
                </div>
                {m.isHost && (
                  <Crown className="absolute -top-1 -right-1 w-3.5 h-3.5 text-yellow-400 drop-shadow" />
                )}
                {isSpeaking && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 ring-2 ring-surface-900 animate-pulse" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white truncate">
                    {m.username}
                    {isYou && <span className="text-text-muted font-normal"> (you)</span>}
                  </span>
                  {m.isHost && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 font-semibold">
                      Host
                    </span>
                  )}
                </div>
              </div>
              <div className="text-text-muted">
                {m.isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 opacity-40" />}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
