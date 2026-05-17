import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, PhoneOff, Volume2, VolumeX, Headphones, X
} from 'lucide-react';
import { VoiceUser } from '../types';
import { useRoomStore } from '../store/roomStore';

interface VoiceChatProps {
  isInVoice: boolean;
  isMuted: boolean;
  voiceUsers: Map<string, VoiceUser>;
  speakingUsers: Set<string>;
  onJoin: () => Promise<void>;
  onLeave: () => void;
  onToggleMute: () => void;
  onClose: () => void;
}

function VoiceUserCard({
  user,
  isSpeaking,
  isCurrentUser,
}: {
  user: VoiceUser;
  isSpeaking: boolean;
  isCurrentUser: boolean;
}) {
  const member = useRoomStore(s => s.room?.members.find(m => m.id === user.userId));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-all ${
        isSpeaking
          ? 'bg-accent/10 border border-accent/30'
          : 'bg-surface-800/50'
      }`}
    >
      {/* Avatar with speaking ring */}
      <div className="relative">
        <div
          className="avatar w-8 h-8 text-sm"
          style={{ backgroundColor: member?.avatarColor ?? '#6366f1' }}
        >
          {user.username[0]?.toUpperCase()}
        </div>
        {isSpeaking && (
          <motion.div
            className="absolute -inset-1 rounded-full border-2 border-accent"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}
      </div>

      <span className="text-sm text-text-primary flex-1 truncate">
        {user.username}
        {isCurrentUser && <span className="text-text-muted ml-1">(you)</span>}
      </span>

      {user.isMuted && (
        <MicOff className="w-3.5 h-3.5 text-text-muted" />
      )}
      {!user.isMuted && isSpeaking && (
        <Volume2 className="w-3.5 h-3.5 text-accent" />
      )}
    </motion.div>
  );
}

export function VoiceChat({
  isInVoice,
  isMuted,
  voiceUsers,
  speakingUsers,
  onJoin,
  onLeave,
  onToggleMute,
  onClose,
}: VoiceChatProps) {
  const { userId, username, currentMember } = useRoomStore();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    setJoining(true);
    setError('');
    try {
      await onJoin();
    } catch (err) {
      setError('Could not access microphone. Check permissions.');
    } finally {
      setJoining(false);
    }
  };

  const voiceUserList = Array.from(voiceUsers.values());

  return (
    <div className="flex flex-col h-full glass-panel rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Headphones className="w-4 h-4 text-accent" />
          <span className="font-medium text-sm text-white">Voice</span>
          {isInVoice && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-text-secondary hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!isInVoice ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-6">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
              <Mic className="w-7 h-7 text-accent" />
            </div>
            <div>
              <p className="text-sm font-medium text-white mb-1">Join Voice Chat</p>
              <p className="text-xs text-text-muted">
                P2P voice via WebRTC — free, no servers needed
              </p>
            </div>
            {error && (
              <p className="text-rose-400 text-xs">{error}</p>
            )}
            <button
              onClick={handleJoin}
              disabled={joining}
              className="btn-primary flex items-center gap-2"
            >
              {joining ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
              Join Voice
            </button>
          </div>
        ) : (
          <>
            {/* Self */}
            <VoiceUserCard
              user={{ userId, username, isSpeaking: speakingUsers.has(userId), isMuted, stream: undefined }}
              isSpeaking={speakingUsers.has(userId)}
              isCurrentUser
            />

            {/* Others */}
            <AnimatePresence>
              {voiceUserList.map(user => (
                <VoiceUserCard
                  key={user.userId}
                  user={user}
                  isSpeaking={speakingUsers.has(user.userId)}
                  isCurrentUser={false}
                />
              ))}
            </AnimatePresence>

            {voiceUserList.length === 0 && (
              <p className="text-center text-xs text-text-muted py-4">
                You're the only one in voice
              </p>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      {isInVoice && (
        <div className="p-3 border-t border-white/[0.06] flex gap-2">
          <button
            onClick={onToggleMute}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all ${
              isMuted
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30'
                : 'bg-white/[0.05] text-text-primary hover:bg-white/[0.1]'
            }`}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
          <button
            onClick={onLeave}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 transition-all"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}