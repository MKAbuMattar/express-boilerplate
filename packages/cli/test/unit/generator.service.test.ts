import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {Auths} from '../../src/model/auth.ts';
import type {GenerateOptions} from '../../src/model/generate-options.ts';
import {GeneratorServiceImpl} from '../../src/service/impl/generator.service.impl.ts';
import {WorkspaceServiceImpl} from '../../src/service/impl/workspace.service.impl.ts';

describe('GeneratorServiceImpl entity registration', () => {
  const workspace = new WorkspaceServiceImpl();
  const generator = new GeneratorServiceImpl(workspace);
  const config = 'packages/persistence/src/config/database.config.ts';

  const project = (entities: string) => {
    const root = mkdtempSync(join(tmpdir(), 'eb-gen-'));
    for (const pkg of ['common', 'persistence']) {
      mkdirSync(join(root, 'packages', pkg, 'src/config'), {recursive: true});
      writeFileSync(
        join(root, 'packages', pkg, 'package.json'),
        JSON.stringify({name: `@shop/${pkg}`}),
      );
    }
    mkdirSync(join(root, 'packages/persistence/src/model'), {recursive: true});
    writeFileSync(
      join(root, config),
      `import {UserEntity} from '../model/user.entity.js';\n\nexport class DatabaseConfig {\n  static readonly entities = ${entities};\n}\n`,
    );
    return root;
  };
  const options = (name: string): GenerateOptions => ({
    name,
    fields: [{name: 'label', type: 'string'}],
    values: [],
    status: 422,
    migration: false,
    repository: false,
    testType: 'integration',
    skipTests: true,
    auth: Auths.parse('jwt'),
    publicReads: false,
    method: 'GET',
    path: '/',
    scope: null,
    action: null,
  });
  const entities = (root: string) =>
    /entities = \[([^\]]*)\]/
      .exec(readFileSync(join(root, config), 'utf8'))![1]!
      .split(',')
      .map((e) => e.trim());

  it.each([
    ['one line', '[UserEntity]'],
    [
      'one per line, trailing comma',
      '[\n    UserEntity,\n    OrderEntity,\n  ]',
    ],
  ])('appends to a list written %s, with no empty slot', (_label, list) => {
    const root = project(list);
    const plan = generator.plan('entity', root, options('tag'));
    workspace.apply(root, plan, {dryRun: false, force: false});
    expect(entities(root).filter((e) => e === '')).toEqual([]);
    expect(entities(root)).toContain('TagEntity');
  });

  it('registers an entity once, however often it runs', () => {
    const root = project('[UserEntity]');
    for (let i = 0; i < 2; i++) {
      workspace.apply(root, generator.plan('entity', root, options('tag')), {
        dryRun: false,
        force: true,
      });
    }
    expect(entities(root).filter((e) => e === 'TagEntity')).toHaveLength(1);
  });
});
