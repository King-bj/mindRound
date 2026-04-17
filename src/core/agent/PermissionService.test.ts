import { describe, expect, it, vi } from 'vitest';
import { PermissionService } from './PermissionService';
import type { ITool } from './types';

const READ_TOOL: ITool = {
  name: 'read_file',
  description: 'read',
  parameters: { type: 'object' },
  permission: 'readonly-sandbox',
  cacheable: true,
  run: vi.fn(),
};

const WRITE_TOOL: ITool = {
  name: 'write_file',
  description: 'write',
  parameters: { type: 'object' },
  permission: 'write',
  cacheable: false,
  run: vi.fn(),
};

const EXEC_TOOL: ITool = {
  name: 'execute_command',
  description: 'exec',
  parameters: { type: 'object' },
  permission: 'exec',
  cacheable: false,
  run: vi.fn(),
};

describe('PermissionService', () => {
  it('sandbox 内读操作直接允许', async () => {
    const service = new PermissionService(async () => ['C:/work']);
    const result = await service.authorize(READ_TOOL, { path: 'C:/work/docs/readme.md' });
    expect(result).toEqual({ allowed: true, allowOutsideSandbox: false });
  });

  it('sandbox 外读操作会触发确认', async () => {
    const service = new PermissionService(async () => ['C:/work']);
    const confirm = vi.fn().mockResolvedValue('once');
    service.confirmHandler = confirm;

    const result = await service.authorize(READ_TOOL, {
      path: 'C:/Users/demo/Desktop/todo.txt',
    });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ allowed: true, allowOutsideSandbox: true });
  });

  it('write/exec 始终确认，session 决策可复用', async () => {
    const service = new PermissionService(async () => ['C:/work']);
    const confirm = vi
      .fn()
      .mockResolvedValueOnce('session')
      .mockResolvedValueOnce('session');
    service.confirmHandler = confirm;

    const firstWrite = await service.authorize(WRITE_TOOL, {
      path: 'C:/work/note.md',
      content: 'hello',
    });
    const secondWrite = await service.authorize(WRITE_TOOL, {
      path: 'C:/work/note.md',
      content: 'world',
    });
    const firstExec = await service.authorize(EXEC_TOOL, { command: 'ls' });
    const secondExec = await service.authorize(EXEC_TOOL, { command: 'ls' });

    expect(firstWrite.allowed).toBe(true);
    expect(secondWrite.allowed).toBe(true);
    expect(firstExec.allowed).toBe(true);
    expect(secondExec.allowed).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('用户拒绝时返回 deny', async () => {
    const service = new PermissionService(async () => ['C:/work']);
    service.confirmHandler = vi.fn().mockResolvedValue('deny');

    const writeResult = await service.authorize(WRITE_TOOL, {
      path: 'C:/work/note.md',
      content: 'x',
    });
    const readResult = await service.authorize(READ_TOOL, {
      path: 'D:/outside.md',
    });

    expect(writeResult).toEqual({ allowed: false, allowOutsideSandbox: false });
    expect(readResult).toEqual({ allowed: false, allowOutsideSandbox: false });
  });
});
