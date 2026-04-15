/**
 * 聊天输入组件
 * @description 用户输入消息的输入框组件，支持发送按钮和键盘快捷键
 */
import React, { useState, useRef, useCallback } from 'react';

interface ChatInputProps {
  /** 发送消息回调 */
  onSend: (content: string) => void;
  /** 是否禁用输入 */
  disabled?: boolean;
  /** 占位符文本 */
  placeholder?: string;
}

/**
 * 聊天输入组件
 * - Enter 发送消息
 * - Shift+Enter 换行
 */
export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  disabled = false,
  placeholder = '输入消息...',
}) => {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setValue('');

    // 重置 textarea 高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);

    // 自动调整高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, []);

  return (
    <div className="chat-input-container">
      <textarea
        ref={textareaRef}
        className="chat-input-textarea"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
      />
      <button
        className="chat-input-send-btn"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        type="button"
      >
        发送
      </button>
    </div>
  );
};
