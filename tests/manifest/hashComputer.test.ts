import { describe, it, expect } from 'vitest';
import { computeStagedHash, computeContentHash } from '../../src/manifest/hashComputer.js';

describe('computeStagedHash', () => {
  it('produces deterministic hashes', () => {
    const hash1 = computeStagedHash(['a.ts', 'b.ts'], 'diff content');
    const hash2 = computeStagedHash(['a.ts', 'b.ts'], 'diff content');
    expect(hash1).toBe(hash2);
  });

  it('sorts files before hashing', () => {
    const hash1 = computeStagedHash(['b.ts', 'a.ts'], 'diff');
    const hash2 = computeStagedHash(['a.ts', 'b.ts'], 'diff');
    expect(hash1).toBe(hash2);
  });

  it('different content produces different hashes', () => {
    const hash1 = computeStagedHash(['a.ts'], 'diff1');
    const hash2 = computeStagedHash(['a.ts'], 'diff2');
    expect(hash1).not.toBe(hash2);
  });

  it('different files produce different hashes', () => {
    const hash1 = computeStagedHash(['a.ts'], 'diff');
    const hash2 = computeStagedHash(['b.ts'], 'diff');
    expect(hash1).not.toBe(hash2);
  });

  it('returns 64-char hex string', () => {
    const hash = computeStagedHash(['file.ts'], 'content');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles empty inputs', () => {
    const hash = computeStagedHash([], '');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('computeContentHash', () => {
  it('produces deterministic hashes', () => {
    expect(computeContentHash('hello')).toBe(computeContentHash('hello'));
  });

  it('different content produces different hashes', () => {
    expect(computeContentHash('a')).not.toBe(computeContentHash('b'));
  });
});
