import {execFile} from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative} from 'node:path';
import {promisify} from 'node:util';
import {CliConstants} from '../../constant/cli.constants.ts';
import {FeatureManifest} from '../../model/feature-manifest.ts';
import {
  type FeatureChange,
  type FeatureFileChange,
  FeatureService,
} from '../feature.service.ts';
import type {ProjectService} from '../project.service.ts';
import type {TemplateService} from '../template.service.ts';

type ProjectRecord = {name: string; features: string[]};

/**
 * Builds the project twice from the template, with the current features
 * (base) and with the new set (next), then brings each difference into the
 * real project with a three-way merge (`git merge-file`): base is the common
 * ancestor, your file is one side, next is the other. Your own changes stay;
 * where they meet the feature's, the file gets <<<<<<< markers to resolve.
 */
export class FeatureServiceImpl extends FeatureService {
  private static readonly exec = promisify(execFile);
  /** The lockfile is rebuilt by pnpm install, never merged. */
  private static readonly SKIP = new Set(['pnpm-lock.yaml']);
  private readonly templates: TemplateService;
  private readonly projects: ProjectService;

  constructor(templates: TemplateService, projects: ProjectService) {
    super();
    this.templates = templates;
    this.projects = projects;
  }

  async change(
    root: string,
    add: string[],
    remove: string[],
    options: {dryRun: boolean; template?: string; ref?: string},
  ): Promise<FeatureChange> {
    const record = JSON.parse(
      readFileSync(join(root, CliConstants.RECORD_FILE), 'utf8'),
    ) as ProjectRecord;
    const source = await this.templates.resolve(options.template, options.ref);
    const manifest = FeatureManifest.load(source);
    const before = manifest.resolve(record.features);
    for (const id of remove) {
      const needers = manifest.features.filter(
        (f) =>
          before.has(f.id) &&
          !remove.includes(f.id) &&
          f.requires?.includes(id),
      );
      if (needers.length > 0) {
        throw new Error(
          `${id} is needed by ${needers.map((f) => f.id).join(', ')}`,
        );
      }
    }
    const after = manifest.resolve(
      [...before, ...add].filter((id) => !remove.includes(id)),
    );
    const added = [...after].filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !after.has(id));

    const work = mkdtempSync(join(tmpdir(), 'eb-features-'));
    try {
      const base = join(work, 'base');
      const next = join(work, 'next');
      for (const [dir, enabled] of [
        [base, before],
        [next, after],
      ] as const) {
        this.projects.create({
          source,
          target: dir,
          name: record.name,
          enabled: new Set(enabled),
          manifest,
        });
        // The project was formatted after create; format both copies the
        // same way, or every cut block would look like a change.
        await FeatureServiceImpl.format(root, dir);
      }
      const files = FeatureServiceImpl.changes(root, base, next);
      if (options.dryRun) return {added, removed, files, conflicts: []};
      const conflicts: string[] = [];
      for (const file of files) {
        if (await FeatureServiceImpl.bring(root, base, next, file)) {
          conflicts.push(file.path);
        }
      }
      return {added, removed, files, conflicts};
    } finally {
      rmSync(work, {recursive: true, force: true});
    }
  }

  /** Files that differ between base and next, and what to do with each. */
  private static changes(
    root: string,
    base: string,
    next: string,
  ): FeatureFileChange[] {
    const paths = new Set([
      ...FeatureServiceImpl.walk(base, base),
      ...FeatureServiceImpl.walk(next, next),
    ]);
    const read = (dir: string, path: string) =>
      existsSync(join(dir, path)) ? readFileSync(join(dir, path)) : null;
    const result: FeatureFileChange[] = [];
    for (const path of [...paths].sort()) {
      if (FeatureServiceImpl.SKIP.has(path)) continue;
      const from = read(base, path);
      const to = read(next, path);
      if (from && to && from.equals(to)) continue;
      const mine = read(root, path);
      if (!from) {
        result.push({path, action: mine ? 'merge' : 'create'});
      } else if (!to) {
        // Delete only what you never touched.
        result.push({path, action: mine?.equals(from) ? 'delete' : 'keep'});
      } else {
        result.push({path, action: mine ? 'merge' : 'create'});
      }
    }
    return result;
  }

  /** Applies one change; true when the file was left with conflict markers. */
  private static async bring(
    root: string,
    base: string,
    next: string,
    file: FeatureFileChange,
  ): Promise<boolean> {
    const mine = join(root, file.path);
    switch (file.action) {
      case 'create':
        mkdirSync(dirname(mine), {recursive: true});
        copyFileSync(join(next, file.path), mine);
        return false;
      case 'delete':
        rmSync(mine);
        return false;
      case 'keep':
        return false;
      case 'merge': {
        const ancestor = existsSync(join(base, file.path))
          ? join(base, file.path)
          : '/dev/null';
        try {
          await FeatureServiceImpl.exec('git', [
            'merge-file',
            '-L',
            'your version',
            '-L',
            'before',
            '-L',
            'with the feature change',
            mine,
            ancestor,
            join(next, file.path),
          ]);
          return false;
        } catch (error) {
          // Exit code = number of conflicts; above 127 is a real failure.
          const code = (error as {code?: number}).code ?? 255;
          if (code > 0 && code < 128) return true;
          throw new Error(
            `git merge-file ${file.path}: ${(error as Error).message}`,
          );
        }
      }
    }
  }

  /** The project's own Biome and config, the way `pnpm lint:fix` runs it. */
  private static async format(root: string, dir: string): Promise<void> {
    const biome = join(root, 'node_modules/.bin/biome');
    await FeatureServiceImpl.exec(
      biome,
      ['check', '--write', './apps', './packages'],
      {cwd: dir, maxBuffer: 64 * 1024 * 1024},
    ).catch(() => {
      // Unformatted leftovers only make the merge noisier.
    });
  }

  private static *walk(dir: string, top: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules') continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory())
        yield* FeatureServiceImpl.walk(path, top);
      else yield relative(top, path);
    }
  }
}
