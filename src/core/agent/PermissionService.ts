/**
 * 权限服务
 * @description 根据工具类型 + 入参 + sandbox 根决策：allow / confirm / deny。
 * - readonly-sandbox 工具：路径在 sandbox 内直接 allow；否则需要用户弹框确认
 * - write / exec 工具：始终弹框确认
 * - read-any 工具：始终 allow
 *
 * UI 层通过设置 `confirmHandler` 注入真正的弹框实现。
 */
import type { ITool, ToolPermission } from './types';
import { isAbsolutePath } from './tools/pathResolve';

/** 用户对某次 confirm 的决策 */
export type PermissionDecision = 'once' | 'session' | 'deny';

/** 送到 UI 的 prompt 数据 */
export interface PermissionPrompt {
  tool: ITool;
  args: Record<string, unknown>;
  /** 人类可读的摘要（如 "读取 C:\\foo.txt"） */
  summary: string;
}

/** Agent 取得的授权结果 */
export interface AuthorizeResult {
  allowed: boolean;
  /** 若用户确认访问 sandbox 外，则传给 Rust 侧跳过 sandbox 校验 */
  allowOutsideSandbox: boolean;
}

export interface IPermissionService {
  /** 为一次 tool 调用决策 + 可能地弹框询问用户 */
  authorize(tool: ITool, args: Record<string, unknown>): Promise<AuthorizeResult>;
  /** UI 层设置；未设置时任何 confirm 请求视为 deny */
  confirmHandler?: (prompt: PermissionPrompt) => Promise<PermissionDecision>;
  /** 供工具使用的 sandbox 根列表 */
  getSandboxRoots(): Promise<string[]>;
}

export class PermissionService implements IPermissionService {
  /** 本会话的"永久允许"集合：key 形如 `${tool.name}:${scope}` */
  private sessionAllow = new Set<string>();

  constructor(private rootsProvider: () => Promise<string[]>) {}

  confirmHandler?: (prompt: PermissionPrompt) => Promise<PermissionDecision>;

  async getSandboxRoots(): Promise<string[]> {
    return this.rootsProvider();
  }

  async authorize(
    tool: ITool,
    args: Record<string, unknown>
  ): Promise<AuthorizeResult> {
    switch (tool.permission) {
      case 'read-any':
        return { allowed: true, allowOutsideSandbox: false };

      case 'readonly-sandbox': {
        const path = getStringArg(args, 'path');
        // 空路径或相对路径：工具 run 中会基于数据目录归一化，等价于沙箱内
        if (!path || !isAbsolutePath(path)) {
          return { allowed: true, allowOutsideSandbox: false };
        }
        const roots = await this.getSandboxRoots();
        if (isInsideAnyRoot(path, roots)) {
          return { allowed: true, allowOutsideSandbox: false };
        }
        const key = `${tool.name}:${pathScopeKey(path)}`;
        return this.authorizeWithSessionKey(tool, args, {
          sessionKey: key,
          summary: `读取 ${path}`,
          bypassOnAllow: true,
        });
      }

      case 'write': {
        const path = getStringArg(args, 'path');
        // 相对路径：工具 run 中归一化到数据目录内，等价于沙箱内写入，跳过弹框
        if (path && !isAbsolutePath(path)) {
          return { allowed: true, allowOutsideSandbox: false };
        }
        const key = `${tool.name}:${pathScopeKey(path)}`;
        return this.authorizeWithSessionKey(tool, args, {
          sessionKey: key,
          summary: `写入 ${path}`,
          bypassOnAllow: true,
        });
      }

      case 'exec': {
        const cmd = getStringArg(args, 'command');
        const key = `${tool.name}:${cmd.slice(0, 100)}`;
        return this.authorizeWithSessionKey(tool, args, {
          sessionKey: key,
          summary: `执行命令: ${cmd}`,
          bypassOnAllow: false,
        });
      }

      default:
        return assertNever(tool.permission);
    }
  }

  /**
   * 会话白名单命中则直接放行，否则弹框询问后套用决策
   */
  private async authorizeWithSessionKey(
    tool: ITool,
    args: Record<string, unknown>,
    opts: { sessionKey: string; summary: string; bypassOnAllow: boolean }
  ): Promise<AuthorizeResult> {
    if (this.sessionAllow.has(opts.sessionKey)) {
      return { allowed: true, allowOutsideSandbox: opts.bypassOnAllow };
    }
    const decision = await this.askUser(tool, args, opts.summary);
    return this.applyDecision(decision, opts.sessionKey, opts.bypassOnAllow);
  }

  private applyDecision(
    decision: PermissionDecision,
    key: string,
    needsBypass: boolean
  ): AuthorizeResult {
    if (decision === 'deny') return { allowed: false, allowOutsideSandbox: false };
    if (decision === 'session') this.sessionAllow.add(key);
    return { allowed: true, allowOutsideSandbox: needsBypass };
  }

  private async askUser(
    tool: ITool,
    args: Record<string, unknown>,
    summary: string
  ): Promise<PermissionDecision> {
    if (!this.confirmHandler) {
      console.warn('[PermissionService] confirmHandler 未设置，默认 deny');
      return 'deny';
    }
    return this.confirmHandler({ tool, args, summary });
  }
}

function getStringArg(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === 'string' ? v : '';
}

function pathScopeKey(path: string): string {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : normalized;
}

export function isInsideAnyRoot(path: string, roots: string[]): boolean {
  const norm = (s: string) =>
    s
      .replace(/\\/g, '/')
      .replace(/\/+$/, '')
      .toLowerCase();
  const child = norm(path);
  for (const r of roots) {
    if (!r) continue;
    const root = norm(r);
    if (child === root || child.startsWith(root + '/')) {
      return true;
    }
  }
  return false;
}

function assertNever(x: ToolPermission): never {
  throw new Error(`unhandled permission class: ${x as string}`);
}
