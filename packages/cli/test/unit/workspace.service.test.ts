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
import {Plan} from '../../src/model/plan.ts';
import {WorkspaceServiceImpl} from '../../src/service/impl/workspace.service.impl.ts';
import {CodeTemplates} from '../../src/util/code-templates.ts';

describe('WorkspaceServiceImpl.apply', () => {
  const workspace = new WorkspaceServiceImpl();
  const project = () => {
    const root = mkdtempSync(join(tmpdir(), 'eb-ws-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'src/app.ts'),
      "import {A} from './a.js';\n\nlist = [A];\n",
    );
    return root;
  };
  const read = (root: string, path: string) =>
    readFileSync(join(root, path), 'utf8');

  it('creates files and edits registrations', () => {
    const root = project();
    const plan = new Plan()
      .create('src/b.ts', 'export class B {}\n')
      .edit(
        'src/app.ts',
        ['import', "import {B} from './b.js';"],
        [/list = \[A\]/, () => 'list = [A, B]'],
      );
    const applied = workspace.apply(root, plan, {dryRun: false, force: false});
    expect(applied.map((f) => `${f.kind} ${f.path}`)).toEqual([
      'create src/b.ts',
      'edit src/app.ts',
    ]);
    expect(read(root, 'src/app.ts')).toBe(
      "import {A} from './a.js';\nimport {B} from './b.js';\n\nlist = [A, B];\n",
    );
  });

  it('writes nothing when one edit cannot find its anchor', () => {
    const root = project();
    const plan = new Plan()
      .create('src/b.ts', 'export class B {}\n')
      .edit('src/app.ts', [/missing anchor/, 'x']);
    expect(() =>
      workspace.apply(root, plan, {dryRun: false, force: false}),
    ).toThrow(/could not find where to register/);
    expect(existsSync(join(root, 'src/b.ts'))).toBe(false);
  });

  it('dry run reports the added lines and writes nothing', () => {
    const root = project();
    const plan = new Plan().create('src/b.ts', 'export class B {}\n');
    const [file] = workspace.apply(root, plan, {dryRun: true, force: false});
    expect(file!.added).toContain('export class B {}');
    expect(existsSync(join(root, 'src/b.ts'))).toBe(false);
  });

  it('overwrites an existing file only with force', () => {
    const root = project();
    const plan = new Plan().create('src/app.ts', 'new\n');
    expect(() =>
      workspace.apply(root, plan, {dryRun: false, force: false}),
    ).toThrow(/--force/);
    workspace.apply(root, plan, {dryRun: false, force: true});
    expect(read(root, 'src/app.ts')).toBe('new\n');
  });
});

describe('CodeTemplates.migrationIntent', () => {
  it.each([
    ['create_orders_table', {kind: 'create', table: 'orders'}],
    ['add_status_to_orders', {kind: 'add', column: 'status', table: 'orders'}],
    [
      'add_paid_at_to_orders_table',
      {kind: 'add', column: 'paid_at', table: 'orders'},
    ],
    [
      'drop_status_from_orders',
      {kind: 'drop', column: 'status', table: 'orders'},
    ],
    ['backfill_prices', {kind: 'blank'}],
  ])('%s', (name, intent) => {
    expect(CodeTemplates.migrationIntent(name)).toEqual(intent);
  });
});
