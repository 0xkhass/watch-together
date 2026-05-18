import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Reaction } from '../types';

export const ReactionOverlay = memo(function ReactionOverlay({
  reactions,
}: {
  reactions: Reaction[];
}) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <AnimatePresence>
        {reactions.map((r) => (
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
});
