import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useRef } from 'react';
import { EmojiPicker } from './EmojiPicker';

function EmojiPickerHost({
  onPick,
  onClose,
}: {
  onPick: (e: string) => void;
  onClose: () => void;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={anchorRef} data-testid="anchor" style={{ width: 320, height: 48 }} />
      <EmojiPicker anchorRef={anchorRef} onPick={onPick} onClose={onClose} />
    </>
  );
}

describe('EmojiPicker', () => {
  it('calls onPick with emoji and onClose when a cell is clicked', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<EmojiPickerHost onPick={onPick} onClose={onClose} />);

    const cell = screen.getByRole('button', { name: /插入表情 😀/ });
    fireEvent.click(cell);

    expect(onPick).toHaveBeenCalledWith('😀');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<EmojiPickerHost onPick={onPick} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<EmojiPickerHost onPick={vi.fn()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '关闭表情' }));

    expect(onClose).toHaveBeenCalled();
  });
});
