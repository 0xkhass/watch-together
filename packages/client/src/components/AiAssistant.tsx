import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, X, Sparkles, MessageSquare, ListVideo, Loader2 } from 'lucide-react';
import { aiChatReply, summarizeChat, suggestWatchPartyIdeas } from '../services/ai';
import { ChatMessage } from '../types';

interface AiAssistantProps {
  messages: ChatMessage[];
  roomName?: string;
  videoName?: string | null;
  memberCount: number;
  onClose: () => void;
}

export function AiAssistant({ messages, roomName, videoName, memberCount, onClose }: AiAssistantProps) {
  const [tab, setTab] = useState<'chat' | 'summary' | 'ideas'>('chat');
  const [input, setInput] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<string>) => {
    setLoading(true);
    setError('');
    try {
      setReply(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full glass-panel rounded-xl overflow-hidden border border-violet-500/20">
      <motion.div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-violet-500/5">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-violet-400" />
          <span className="font-medium text-sm text-white">AI Assistant</span>
          <span className="text-[10px] uppercase tracking-wider text-violet-400/80 bg-violet-500/10 px-1.5 py-0.5 rounded">
            Free
          </span>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
          <X className="w-3.5 h-3.5 text-text-secondary" />
        </button>
      </motion.div>

      <div className="flex gap-1 p-2 border-b border-white/[0.06]">
        {(
          [
            ['chat', MessageSquare, 'Ask'],
            ['summary', Sparkles, 'Summary'],
            ['ideas', ListVideo, 'Ideas'],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === id ? 'bg-violet-500/20 text-violet-300' : 'text-text-muted hover:text-white'
            }`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        <p className="text-xs text-text-muted mb-3">
          Free AI — no paid plan. Uses Pollinations; optional free Gemini key in local storage.
        </p>

        {tab === 'chat' && (
          <div className="space-y-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about the movie, room, or what to watch…"
              className="input-field w-full text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && input.trim()) {
                  void run(() => aiChatReply(input, { roomName, videoName: videoName ?? undefined, memberCount }));
                }
              }}
            />
            <button
              type="button"
              disabled={!input.trim() || loading}
              onClick={() => void run(() => aiChatReply(input, { roomName, videoName: videoName ?? undefined, memberCount }))}
              className="btn-primary w-full text-sm py-2"
            >
              Ask AI
            </button>
          </div>
        )}

        {tab === 'summary' && (
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              void run(() =>
                summarizeChat(
                  messages.filter((m) => m.type === 'text').map((m) => ({ username: m.username, content: m.content })),
                ),
              )
            }
            className="btn-ghost w-full text-sm border border-violet-500/30"
          >
            Summarize last messages
          </button>
        )}

        {tab === 'ideas' && (
          <motion.div className="space-y-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Topic (optional) e.g. sci-fi, comedy…"
              className="input-field w-full text-sm"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => void run(() => suggestWatchPartyIdeas(input))}
              className="btn-primary w-full text-sm py-2"
            >
              Get watch ideas
            </button>
          </motion.div>
        )}

        {loading && (
          <div className="flex items-center gap-2 mt-4 text-violet-300 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Thinking…
          </div>
        )}
        {error && <p className="mt-3 text-rose-400 text-sm">{error}</p>}
        {reply && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 rounded-xl bg-surface-800/80 text-sm text-text-primary whitespace-pre-wrap leading-relaxed border border-white/[0.06]"
          >
            {reply}
          </motion.div>
        )}
      </div>
    </div>
  );
}
