import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {FeatureManifest} from '../../src/model/feature-manifest.ts';
import {ProjectServiceImpl} from '../../src/service/impl/project.service.impl.ts';

describe('ProjectServiceImpl', () => {
  const template = mkdtempSync(join(tmpdir(), 'eb-template-'));
  const write = (path: string, text: string) => {
    mkdirSync(join(template, path, '..'), {recursive: true});
    writeFileSync(join(template, path), text);
  };
  write(
    'boilerplate.features.json',
    JSON.stringify({
      features: [
        {
          id: 'redis',
          title: 'Redis',
          group: 'data',
          remove: ['src/redis.ts'],
          dependencies: {'.': ['redis']},
        },
      ],
      presets: {minimal: [], full: '*'},
    }),
  );
  write(
    'package.json',
    JSON.stringify({
      name: 'express-boilerplate',
      homepage: 'https://example.com',
      dependencies: {redis: '1.0.0', express: '5.0.0'},
    }),
  );
  write('src/redis.ts', 'export class Redis {}\n');
  write(
    'src/app.ts',
    [
      "import {Redis} from './redis.js';",
      "import {Scope} from '@express-boilerplate/common/scope.js';",
      '// @feature:redis',
      'new Redis();',
      '// @end:redis',
      'new Scope();',
      '',
    ].join('\n'),
  );
  write('node_modules/x/index.js', '');
  const cliSource = [
    "static readonly SCOPE = '@express-boilerplate/';",
    '// @feature:redis',
    'example',
    '// @end:redis',
    '',
  ].join('\n');
  write('packages/cli/src/constants.ts', cliSource);

  const create = (features: string[]) => {
    const target = join(mkdtempSync(join(tmpdir(), 'eb-out-')), 'app');
    const manifest = FeatureManifest.load(template);
    new ProjectServiceImpl().create({
      source: template,
      target,
      name: 'shop',
      enabled: manifest.resolve(features),
      manifest,
    });
    return (path: string) =>
      existsSync(join(target, path))
        ? readFileSync(join(target, path), 'utf8')
        : null;
  };

  it('removes what a disabled feature owns, uses and depends on', () => {
    const read = create([]);
    expect(read('src/redis.ts')).toBeNull();
    expect(read('src/app.ts')).toBe(
      "import {Scope} from '@shop/common/scope.js';\nnew Scope();\n",
    );
    const pkg = JSON.parse(read('package.json')!);
    expect(pkg).toEqual({name: 'shop', dependencies: {express: '5.0.0'}});
    expect(read('boilerplate.features.json')).toBeNull();
    expect(JSON.parse(read('boilerplate.json')!)).toEqual({
      name: 'shop',
      features: [],
    });
    expect(read('node_modules/x/index.js')).toBeNull();
    // The CLI keeps the template's names, or it could not rename later.
    expect(read('packages/cli/src/constants.ts')).toBe(cliSource);
  });

  it('keeps an enabled feature and drops only its markers', () => {
    const read = create(['redis']);
    expect(read('src/redis.ts')).not.toBeNull();
    expect(read('src/app.ts')).toContain('new Redis();\nnew Scope();');
    expect(read('src/app.ts')).not.toContain('@feature');
  });
});
