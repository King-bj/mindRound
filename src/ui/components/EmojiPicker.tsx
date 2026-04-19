/**
 * 内置表情选择器
 * @description 常用 emoji 网格；点击遮罩或 Esc 关闭；通过 onPick 回传选中的字符
 */
import React, { useLayoutEffect, useState, useCallback, useEffect } from 'react';

/** 分类标题 + emoji 列表（约 56 个） */
const EMOJI_GROUPS: { title: string; emojis: string[] }[] = [
  {
    title: '笑脸',
    emojis: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰'],
  },
  {
    title: '手势',
    emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤝', '👏', '🙌', '💪', '🙏', '✋', '👋', '🤚'],
  },
  {
    title: '心情',
    emojis: ['❤️', '💔', '💕', '💖', '💯', '🔥', '✨', '⭐', '🌟', '💤', '🤔', '😢', '😭'],
  },
  {
    title: '自然',
    emojis: ['🌈', '☀️', '🌙', '⭐', '☁️', '⛅', '🌧️', '❄️', '🌸', '🌿', '🍀', '🌊'],
  },
  {
    title: '食物',
    emojis: ['☕', '🍵', '🍰', '🎂', '🍎', '🍊', '🍋', '🍌', '🍇', '🍕', '🍔', '🍜'],
  },
  {
    title: '符号',
    emojis: ['✅', '❌', '❓', '❗', '💡', '📝', '🎯', '🚀', '📌', '🔔', '⚠️', '➡️'],
  },
];

export interface EmojiPickerProps {
  /** 用于将弹层定位在输入区域上方 */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** 选中一个 emoji */
  onPick: (emoji: string) => void;
  /** 关闭（遮罩 / Esc） */
  onClose: () => void;
}

/**
 * 固定定位的表情面板 + 全屏遮罩
 */
export const EmojiPicker: React.FC<EmojiPickerProps> = ({ anchorRef, onPick, onClose }) => {
  const [pos, setPos] = useState<{ bottom: number; left: number; width: number }>({
    bottom: 100,
    left: 12,
    width: 300,
  });

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.min(320, Math.max(240, window.innerWidth - 24));
    const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
    const bottom = window.innerHeight - r.top + 8;
    setPos({ bottom, left, width: w });
  }, [anchorRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handlePick = useCallback(
    (emoji: string) => {
      onPick(emoji);
      onClose();
    },
    [onPick, onClose]
  );

  return (
    <div className="emoji-picker-root" role="presentation">
      <button
        type="button"
        className="emoji-picker-backdrop"
        aria-label="关闭表情"
        onClick={onClose}
      />
      <div
        className="emoji-picker-popover"
        role="dialog"
        aria-label="选择表情"
        style={{
          position: 'fixed',
          left: pos.left,
          width: pos.width,
          bottom: pos.bottom,
        }}
      >
        <div className="emoji-picker-scroll">
          {EMOJI_GROUPS.map((g) => (
            <div key={g.title} className="emoji-picker-group">
              <div className="emoji-picker-cat-title">{g.title}</div>
              <div className="emoji-picker-grid">
                {g.emojis.map((emoji) => (
                  <button
                    key={`${g.title}-${emoji}`}
                    type="button"
                    className="emoji-picker-cell"
                    onClick={() => handlePick(emoji)}
                    aria-label={`插入表情 ${emoji}`}
                  >
                    <span className="emoji-picker-char" aria-hidden>
                      {emoji}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
