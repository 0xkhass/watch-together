import { useState, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, MessageSquare } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { useRoomStore } from '../store/roomStore';
import { ChatMessage, EVENTS } from '../types';

const QUICK_EMOJI = ['😂', '🔥', '❤️', '👏', '😮', '🎬'];

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-accent-light break-all"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
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
      className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
    >
      <div
        className="avatar w-6 h-6 text-xs flex-shrink-0 mt-0.5"
        style={{ backgroundColor: msg.avatarColor }}
      >
        {msg.username[0]?.toUpperCase()}
      </div>
      <div className={`max-w-[75%] flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
        {!isOwn && <span className="text-xs text-text-muted ml-1">{msg.username}</span>}
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
            isOwn ? 'bg-accent text-white rounded-tr-sm' : 'bg-surface-700 text-text-primary rounded-tl-sm'
          }`}
        >
          {linkify(msg.content)}
        </div>
      </div>
    </motion.div>
  );
});

MessageBubble.displayName = 'MessageBubble';

interface ChatPanelProps {
  socket: Socket;
  onSend: (content: string) => void;
  onClose: () => void;
}

export function ChatPanel({ socket, onSend, onClose }: ChatPanelProps) {
  const { messages, userId } = useRoomStore();
  const [input, setInput] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastTypingEmitRef = useRef(0);
  const [unread, setUnread] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    const onTyping = (data: { userId: string; username: string }) => {
      if (data.userId === userId) return;
      setTypingUsers((prev) => [...new Set([...prev, data.username])]);
      setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u !== data.username));
      }, 3000);
    };
    socket.on(EVENTS.CHAT_TYPING, onTyping);
    return () => { socket.off(EVENTS.CHAT_TYPING, onTyping); };
  }, [socket, userId]);

  useEffect(() => {
    if (isAtBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    else setUnread((n) => n + 1);
  }, [messages.length, isAtBottom]);

  const emitTyping = () => {
    const now = Date.now();
    if (now - lastTypingEmitRef.current < 2000) return;
    lastTypingEmitRef.current = now;
    socket.emit(EVENTS.CHAT_TYPING);
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.trim()) emitTyping();
  };

  const handleSend = () => {
    const content = input.trim();
    if (!content) return;
    onSend(content);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full glass-panel rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-accent" />
          <span className="font-medium text-sm text-white">Chat</span>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg">
          <X className="w-3.5 h-3.5 text-text-secondary" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" onScroll={(e) => {
        const el = e.currentTarget;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
        setIsAtBottom(atBottom);
        if (atBottom) setUnread(0);
      }}>
        {messages.length === 0 && (
          <p className="text-center text-text-muted text-sm py-8">Say hi to the room 👋</p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} isOwn={msg.userId === userId} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {typingUsers.length > 0 && (
        <p className="px-4 pb-1 text-[11px] text-text-muted italic truncate">
          {typingUsers.join(', ')} typing…
        </p>
      )}

      <AnimatePresence>
        {!isAtBottom && unread > 0 && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              setIsAtBottom(true);
              setUnread(0);
            }}
            className="mx-4 mb-2 text-xs text-accent"
          >
            ↓ {unread} new
          </motion.button>
        )}
      </AnimatePresence>

      <div className="px-3 pb-1 flex gap-1 overflow-x-auto">
        {QUICK_EMOJI.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onSend(e)}
            className="text-lg hover:scale-110 transition-transform px-0.5"
          >
            {e}
          </button>
        ))}
      </div>

      <div className="p-3 border-t border-white/[0.06]">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Message…"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            maxLength={500}
            className="input-field flex-1 text-sm py-2"
          />
          <button type="button" onClick={handleSend} disabled={!input.trim()} className="btn-primary px-3 py-2">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
