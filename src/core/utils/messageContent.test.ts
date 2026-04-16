import { describe, it, expect } from 'vitest';
import { stripModelThinkBlocks } from './messageContent';

describe('stripModelThinkBlocks', () => {
  it('removes fenced ```think blocks', () => {
    const raw = [
      '```think',
      'internal reasoning here',
      '```',
      '',
      '**Hello** world',
    ].join('\n');
    expect(stripModelThinkBlocks(raw)).toContain('**Hello** world');
    expect(stripModelThinkBlocks(raw)).not.toContain('internal reasoning');
  });

  it('removes redacted_thinking tags', () => {
    const raw =
      '<think>secret</think>\n\n## Title\n\nBody.';
    const out = stripModelThinkBlocks(raw);
    expect(out).not.toContain('secret');
    expect(out).toContain('Title');
  });
});
