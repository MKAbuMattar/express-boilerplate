import {describe, expect, it} from 'vitest';
import {MarkerStripper} from '../../src/util/marker-stripper.ts';

describe('MarkerStripper', () => {
  const text = [
    'a',
    '// @feature:redis',
    'redis',
    '  // @feature:bullmq',
    '  bullmq',
    '  // @end:bullmq',
    '// @end:redis',
    '# @feature:!redis',
    'memory only',
    '# @end:!redis',
    'b',
  ].join('\n');

  it('keeps enabled blocks without their marker lines', () => {
    expect(MarkerStripper.strip(text, new Set(['redis', 'bullmq']))).toBe(
      'a\nredis\n  bullmq\nb',
    );
  });

  it('cuts disabled blocks, nested ones included', () => {
    expect(MarkerStripper.strip(text, new Set(['bullmq']))).toBe(
      'a\nmemory only\nb',
    );
  });

  it('wakes a dormant fallback only when the feature is off', () => {
    const code = [
      '// @feature:redis',
      'f(beans) {',
      '// @end:redis',
      '// @feature:!redis',
      '  //~ f() {',
      '// @end:!redis',
    ].join('\n');
    expect(MarkerStripper.strip(code, new Set(['redis']))).toBe('f(beans) {');
    expect(MarkerStripper.strip(code, new Set())).toBe('  f() {');
  });

  it('rejects mismatched and unclosed markers', () => {
    expect(() =>
      MarkerStripper.strip('// @feature:a\n// @end:b', new Set()),
    ).toThrow(/closes @feature:a/);
    expect(() => MarkerStripper.strip('// @feature:a\nx', new Set())).toThrow(
      /never closed/,
    );
  });

  it('ignores a marker that is not on a comment line', () => {
    const code = "const s = '@feature:x';";
    expect(MarkerStripper.strip(code, new Set())).toBe(code);
  });
});
