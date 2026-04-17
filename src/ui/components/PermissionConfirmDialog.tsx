/**
 * 工具权限确认弹框
 * @description Agent 在执行 write / exec / sandbox 外 read 之前弹出；支持「仅此次 / 本会话 / 拒绝」
 */
import React, { useEffect, useRef } from 'react';
import type {
  PermissionDecision,
  PermissionPrompt,
} from '../../core/agent/PermissionService';

interface Props {
  prompt: PermissionPrompt | null;
  onDecide: (decision: PermissionDecision) => void;
}

function formatArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function permissionBadge(perm: string): string {
  switch (perm) {
    case 'readonly-sandbox':
      return '读取（沙箱外）';
    case 'write':
      return '写入';
    case 'exec':
      return '执行命令';
    default:
      return perm;
  }
}

export const PermissionConfirmDialog: React.FC<Props> = ({ prompt, onDecide }) => {
  const denyBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (prompt) {
      denyBtnRef.current?.focus();
    }
  }, [prompt]);

  if (!prompt) return null;
  const { tool, args, summary } = prompt;

  return (
    <div className="permission-overlay" role="dialog" aria-modal="true" aria-label="权限确认">
      <div className="permission-dialog">
        <header className="permission-header">
          <span className={`permission-badge perm-${tool.permission}`}>
            {permissionBadge(tool.permission)}
          </span>
          <h2 className="permission-title">
            Agent 请求使用工具：<code>{tool.name}</code>
          </h2>
        </header>
        <div className="permission-summary">{summary}</div>
        <details className="permission-args">
          <summary>查看原始参数</summary>
          <pre>{formatArgs(args)}</pre>
        </details>
        <div className="permission-tool-desc">{tool.description}</div>
        <footer className="permission-actions">
          <button
            ref={denyBtnRef}
            type="button"
            className="permission-btn deny"
            onClick={() => onDecide('deny')}
          >
            拒绝
          </button>
          <button
            type="button"
            className="permission-btn once"
            onClick={() => onDecide('once')}
          >
            仅此次
          </button>
          <button
            type="button"
            className="permission-btn session"
            onClick={() => onDecide('session')}
          >
            本会话允许
          </button>
        </footer>
      </div>
    </div>
  );
};
