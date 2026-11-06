import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const manifest = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as {name: string; bin: Record<string, string>};

/** npm's own rule (libnpmexec getBinFromManifest) for `npm create <x>`. */
const npmPicks = ({name, bin}: typeof manifest): string => {
  if (new Set(Object.values(bin)).size === 1) return Object.keys(bin)[0]!;
  return name.replace(/^@[^/]+\//, '');
};

describe('package bins', () => {
  it('npm create runs the create command, whatever the key order', () => {
    const reversed = {
      ...manifest,
      bin: Object.fromEntries(Object.entries(manifest.bin).reverse()),
    };
    expect(npmPicks(manifest)).toBe(manifest.name);
    expect(npmPicks(reversed)).toBe(manifest.name);
    expect(manifest.bin[manifest.name]).toBeDefined();
  });
});
