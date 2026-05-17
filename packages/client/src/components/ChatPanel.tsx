import { useState, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, MessageSquare } from 'lucide-react';
import { useRoomStore } from '../store/roomStore';
import { ChatMessage } from '../types';

interface ChatPanelProps {
  onSend: (content: string) => void;
  onClose: () => void;
}

const MessageBubble = memo(({ msg, isOwn }: { msg: ChatMessage; isOwn: boolean }) => {
  if (msg.type === 'system') {
    return (
      <div className="flex justify-center my-1">
        <span className="text-xs text-text-muted bg-surface-800/50 px-3 py-1 rounded-full">
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className="avatar w-6 h-6 text-xs flex-shrink-0 mt-0.5"
        style={{ backgroundColor: msg.avatarColor }}
      >
        {msg.username[0]?.toUpperCase()}
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {!isOwn && (
          <span className="text-xs text-text-muted ml-1">{msg.username}</span>
        )}
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
            isOwn
              ? 'bg-accent text-white rounded-tr-sm'
              : 'bg-surface-700 text-text-primary rounded-tl-sm'
          }`}
        >
          {msg.content}
        </div>
      </div>
    </motion.div>
  );
});

MessageBubble.displayName = 'MessageBubble';

export function ChatPanel({ onSend, onClose }: ChatPanelProps) {
  const { messages, userId } = useRoomStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [unread, setUnread] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      setUnread(n => n + 1);
    }
  }, [messages.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setIsAtBottom(atBottom);
    if (atBottom) setUnread(0);
  };

  const handleSend = () => {
    const content = input.trim();
    if (!content) return;
    onSend(content);
    setInput('');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setIsAtBottom(true);
    setUnread(0);
  };

  return (
    <div className="flex flex-col h-full glass-panel rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-accent" />
          <span className="font-medium text-sm text-white">Chat</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-text-secondary hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
        onScroll={handleScroll}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-sm gap-2">
            <MessageSquare className="w-8 h-8 opacity-30" />
            <p>No messages yet</p>
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isOwn={msg.userId === userId}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Jump to bottom */}
      <AnimatePresence>
        {!isAtBottom && unread > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={scrollToBottom}
            className="mx-4 mb-2 bg-accent/20 text-accent text-xs py-1.5 rounded-lg border border-accent/30 hover:bg-accent/30 transition-colors"
          >
            ↓ {unread} new message{unread > 1 ? 's' : ''}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="p-3 border-t border-white/[0.06]">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Say something..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            maxLength={500}
            className="input-field flex-1 text-sm py-2"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="btn-primary px-3 py-2 disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}