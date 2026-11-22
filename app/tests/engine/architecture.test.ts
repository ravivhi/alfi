/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';

const files = import.meta.glob('../../src/engine/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('architecture', () => {
  it('engine has no Hebrew and no content/steps imports', () => {
    expect(Object.keys(files).length).toBeGreaterThan(0);
    for (const [f, s] of Object.entries(files)) {
      expect(s, f).not.toMatch(/[֐-׿]/);
      expect(s, f).not.toMatch(/from ['"].*\/(content|steps|ui)\//);
    }
  });
});
