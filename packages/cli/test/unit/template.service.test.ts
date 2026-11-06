import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {TemplateServiceImpl} from '../../src/service/impl/template.service.impl.ts';

describe('TemplateServiceImpl.defaultRef', () => {
  it('downloads the release the CLI was published from', () => {
    expect(TemplateServiceImpl.defaultRef('3.1.0')).toBe('v3.1.0');
  });

  it('uses main for an unreleased build', () => {
    expect(TemplateServiceImpl.defaultRef('0.0.0')).toBe('main');
  });

  it('reads the version from package.json', () => {
    expect(TemplateServiceImpl.defaultRef()).toMatch(/^(main|v\d+\.\d+\.\d+)/);
  });
});

describe('TemplateServiceImpl.packageRoot', () => {
  it('finds packages/cli from a module deep in src/', () => {
    const root = TemplateServiceImpl.packageRoot();
    expect(existsSync(join(root, 'src', 'main.ts'))).toBe(true);
  });

  it('finds it from the bundle in dist/ too', () => {
    const root = TemplateServiceImpl.packageRoot();
    expect(TemplateServiceImpl.packageRoot(join(root, 'dist', 'main.js'))).toBe(
      root,
    );
  });
});
