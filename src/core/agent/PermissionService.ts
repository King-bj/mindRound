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
        const roots = await this.getSandboxRoots();
        if (path && isInsideAnyRoot(path, roots)) {
          return { allowed: true, allowOutsideSandbox: false };
        }
        // sandbox 外，需确认
        const key = `${tool.name}:${pathScopeKey(path)}`;
        if (this.sessionAllow.has(key)) {
          return { allowed: true, allowOutsideSandbox: true };
        }
        const decision = await this.askUser(tool, args, `读取 ${path}`);
        return this.applyDecision(decision, key, /*needsBypass=*/ true);
      }

      case 'write': {
        const path = getStringArg(args, 'path');
        const summary = `写入 ${path}`;
        const key = `${tool.name}:${pathScopeKey(path)}`;
        if (this.sessionAllow.has(key)) {
          return { allowed: true, allowOutsideSandbox: true };
        }
        const decision = await this.askUser(tool, args, summary);
        return this.applyDecision(decision, key, /*needsBypass=*/ true);
      }

      case 'exec': {
        const cmd = getStringArg(args, 'command');
        const summary = `执行命令: ${cmd}`;
        const key = `${tool.name}:${cmd.slice(0, 100)}`;
        if (this.sessionAllow.has(key)) {
          return { allowed: true, allowOutsideSandbox: false };
        }
        const decision = await this.askUser(tool, args, summary);
        return this.applyDecision(
          decision,
          key,
          /*needsBypass=*/ false
        );
      }

      default:
        return assertNever(tool.permission);
    }
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
