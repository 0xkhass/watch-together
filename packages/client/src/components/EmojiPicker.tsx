import { memo } from 'react';

const EMOJIS = ['❤️', '😂', '😮', '👏', '🔥', '😭', '🎉', '💯', '🤯', '👀', '🥳', '💀'];

export const EmojiPicker = memo(function EmojiPicker({
  onPick,
}: {
  onPick: (emoji: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 p-2 glass-panel rounded-xl max-w-[200px]">
      {EMOJIS.map((e) => (
        <button
          key={e}
          onClick={() => onPick(e)}
          className="w-8 h-8 flex items-center justify-center text-lg hover:scale-125 active:scale-95 transition-transform"
        >
          {e}
        </button>
      ))}
    </div>
  );
});
