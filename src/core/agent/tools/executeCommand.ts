/**
 * execute_command 工具：执行 shell 命令（Windows 走 powershell，POSIX 走 sh）
 */
import type { ITool } from '../types';
import { invoke } from '../invoke';

interface Args {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timed_out: boolean;
  truncated_stdout: boolean;
  truncated_stderr: boolean;
}

export const executeCommandTool: ITool<Args> = {
  name: 'execute_command',
  description:
    '在本地执行 shell 命令并返回 stdout/stderr/退出码。Windows 使用 PowerShell。带 30 秒默认超时。每次执行都需要用户弹框确认。',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: '要执行的完整命令行' },
      cwd: {
        type: 'string',
        description: '工作目录，默认应用当前目录',
      },
      timeoutMs: {
        type: 'integer',
        minimum: 500,
        maximum: 300000,
        description: '超时毫秒数，默认 30000',
      },
    },
    required: ['command'],
    additionalProperties: false,
  },
  permission: 'exec',
  cacheable: false,
  async run(args: Args): Promise<string> {
    const r = await invoke<ExecResult>('agent_execute_command', {
      args: {
        command: args.command,
        cwd: args.cwd ?? null,
        timeout_ms: args.timeoutMs ?? 30000,
      },
    });
    const parts: string[] = [];
    parts.push(`exitCode=${r.exit_code ?? 'null'}${r.timed_out ? ' (timed out)' : ''}`);
    if (r.stdout.length > 0) {
      parts.push(
        `[stdout${r.truncated_stdout ? ' (truncated)' : ''}]\n${r.stdout}`
      );
    }
    if (r.stderr.length > 0) {
      parts.push(
        `[stderr${r.truncated_stderr ? ' (truncated)' : ''}]\n${r.stderr}`
      );
    }
    return parts.join('\n\n');
  },
};
