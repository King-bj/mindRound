import { describe, it, expect } from 'vitest';
import { parsePersonaIndexJson, serializePersonaIndex, type PersonaIndexFile } from './PersonaIndex';

describe('PersonaIndex', () => {
  it('should parse valid JSON', () => {
    const raw = JSON.stringify({
      version: 1,
      entries: [
        {
          id: 'a-skill',
          displayName: '显示名',
          description: 'd',
          tags: ['t'],
          avatarPath: 'avatar.png',
        },
      ],
    });
    const parsed = parsePersonaIndexJson(raw);
    expect(parsed?.version).toBe(1);
    expect(parsed?.entries[0]?.id).toBe('a-skill');
    expect(parsed?.entries[0]?.displayName).toBe('显示名');
    expect(parsed?.entries[0]?.avatarPath).toBe('avatar.png');
  });

  it('should round-trip serialize', () => {
    const file: PersonaIndexFile = {
      version: 1,
      entries: [
        {
          id: 'x',
          displayName: 'X',
          description: '',
          tags: [],
          avatarPath: null,
        },
      ],
    };
    const back = parsePersonaIndexJson(serializePersonaIndex(file));
    expect(back?.entries[0]?.id).toBe('x');
    expect(back?.entries[0]?.avatarPath).toBeNull();
  });
});
