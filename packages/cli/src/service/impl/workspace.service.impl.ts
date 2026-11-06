import {execFile} from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import {dirname, join} from 'node:path';
import {promisify} from 'node:util';
import type {AppliedFile, Change, Plan} from '../../model/plan.ts';
import {WorkspaceService} from '../workspace.service.ts';

export class WorkspaceServiceImpl extends WorkspaceService {
  private static readonly exec = promisify(execFile);

  root(cwd: string): string {
    let dir = cwd;
    for (;;) {
      if (existsSync(join(dir, 'packages/persistence/package.json'))) {
        return dir;
      }
      const parent = dirname(dir);
      if (parent === dir) {
        throw new Error('Run this inside a project made by create-expresso');
      }
      dir = parent;
    }
  }

  scope(root: string): string {
    const common = JSON.parse(
      this.read(root, 'packages/common/package.json'),
    ) as {name: string};
    return common.name.replace(/\/common$/, '');
  }

  exists(root: string, path: string): boolean {
    return existsSync(join(root, path));
  }

  list(dir: string): string[] {
    return existsSync(dir) ? readdirSync(dir).sort() : [];
  }

  read(root: string, path: string): string {
    return readFileSync(join(root, path), 'utf8');
  }

  apply(
    root: string,
    plan: Plan,
    options: {dryRun: boolean; force: boolean},
  ): AppliedFile[] {
    // Work out every result in memory first: nothing is written unless all
    // creates are allowed and all edits find their anchors.
    const results = plan.files.map((file) => {
      const exists = this.exists(root, file.path);
      if (file.kind === 'create') {
        if (exists && !options.force) {
          throw new Error(`${file.path} exists; use --force to overwrite it`);
        }
        const before = exists ? this.read(root, file.path) : '';
        return {
          path: file.path,
          kind: exists ? ('overwrite' as const) : ('create' as const),
          text: file.content,
          added: WorkspaceServiceImpl.added(before, file.content),
        };
      }
      if (!exists) throw new Error(`${file.path} not found`);
      const before = this.read(root, file.path);
      const text = WorkspaceServiceImpl.edit(file.path, before, file.changes);
      return {
        path: file.path,
        kind: 'edit' as const,
        text,
        added: WorkspaceServiceImpl.added(before, text),
      };
    });
    if (!options.dryRun) {
      for (const {path, text} of results) {
        mkdirSync(dirname(join(root, path)), {recursive: true});
        writeFileSync(join(root, path), text);
      }
    }
    return results.map(({path, kind, added}) => ({path, kind, added}));
  }

  async format(root: string, paths: string[]): Promise<void> {
    await WorkspaceServiceImpl.exec(
      'pnpm',
      ['exec', 'biome', 'check', '--write', ...paths],
      {cwd: root},
    ).catch(() => {
      // Formatting is a convenience: `pnpm lint:fix` does the same later.
    });
  }

  private static edit(path: string, text: string, changes: Change[]): string {
    let result = text;
    for (const [where, what] of changes) {
      if (where === 'named') {
        result = WorkspaceServiceImpl.named(result, what as string);
        continue;
      }
      if (where === 'import') {
        if (result.includes(what as string)) continue;
        result = WorkspaceServiceImpl.afterImports(result, what as string);
        continue;
      }
      if (!where.test(result)) {
        throw new Error(`${path}: could not find where to register (${where})`);
      }
      const next = result.replace(
        where,
        what as (m: string, ...g: string[]) => string,
      );
      // Registering twice (a rerun, or --force) must not duplicate lines.
      const have = new Set(result.split('\n').map((l) => l.trim()));
      const fresh = WorkspaceServiceImpl.added(result, next).filter(
        (l) => l.trim() && !have.has(l.trim()),
      );
      if (fresh.length > 0) result = next;
    }
    return result;
  }

  /** Puts line after the last import, or at the top when there is none. */
  private static afterImports(text: string, line: string): string {
    const end = [...text.matchAll(/^import [\s\S]*?;\n/gm)].at(-1);
    const at = end ? end.index + end[0].length : 0;
    return `${text.slice(0, at)}${line}\n${text.slice(at)}`;
  }

  /** Merges names into `import {...} from 'module'`, or adds that import. */
  private static named(text: string, spec: string): string {
    const [module = '', list = ''] = spec.split('|');
    const names = list.split(',').filter(Boolean);
    const pattern = new RegExp(
      `import \\{([^}]*)\\} from '${RegExp.escape(module)}';`,
    );
    const found = pattern.exec(text);
    if (!found) {
      return WorkspaceServiceImpl.afterImports(
        text,
        `import {${names.join(', ')}} from '${module}';`,
      );
    }
    const have = found[1]!
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    const merged = [...new Set([...have, ...names])];
    return text.replace(
      pattern,
      `import {${merged.join(', ')}} from '${module}';`,
    );
  }

  /** Lines in after that were not in before, in order. */
  private static added(before: string, after: string): string[] {
    const old = new Set(before.split('\n'));
    return after.split('\n').filter((line) => !old.has(line));
  }
}
