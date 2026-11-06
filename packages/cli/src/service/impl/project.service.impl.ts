import {execFile} from 'node:child_process';
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {basename, join, relative} from 'node:path';
import {promisify} from 'node:util';
import {CliConstants} from '../../constant/cli.constants.ts';
import type {CreateOptions} from '../../model/create-options.ts';
import {ImportPruner} from '../../util/import-pruner.ts';
import {MarkerStripper} from '../../util/marker-stripper.ts';
import {ProjectService} from '../project.service.ts';

/**
 * Copies the template, deletes what disabled features own, cuts their marked
 * blocks, drops their dependencies and renames the project. The result has
 * no markers and no manifest: it is plain source for the features chosen.
 */
export class ProjectServiceImpl extends ProjectService {
  create(options: CreateOptions): void {
    const {source, target, name, enabled, manifest} = options;
    if (existsSync(target) && readdirSync(target).length > 0) {
      throw new Error(`${target} exists and is not empty`);
    }
    cpSync(source, target, {
      recursive: true,
      filter: (path) => !CliConstants.SKIP.has(basename(path)),
    });
    for (const feature of manifest.disabled(enabled)) {
      for (const path of feature.remove ?? []) {
        rmSync(join(target, path), {recursive: true, force: true});
      }
    }
    ProjectServiceImpl.rewriteFiles(target, enabled, name);
    for (const feature of manifest.disabled(enabled)) {
      for (const [folder, names] of Object.entries(
        feature.dependencies ?? {},
      )) {
        ProjectServiceImpl.dropDependencies(join(target, folder), names);
      }
    }
    ProjectServiceImpl.finishPackageJson(target, name);
    rmSync(join(target, CliConstants.MANIFEST_FILE), {force: true});
    writeFileSync(
      join(target, CliConstants.RECORD_FILE),
      `${JSON.stringify({name, features: [...enabled].sort()}, null, 2)}\n`,
    );
  }

  async install(target: string): Promise<void> {
    // The copied lockfile still lists dropped features; install prunes it
    // while keeping every other version pinned.
    await ProjectServiceImpl.pnpm(target, 'install', '--no-frozen-lockfile');
  }

  async format(target: string): Promise<void> {
    await ProjectServiceImpl.pnpm(target, 'lint:fix');
  }

  /** Output is shown only when the command fails, so the progress view stays clean. */
  private static async pnpm(cwd: string, ...args: string[]): Promise<void> {
    try {
      await ProjectServiceImpl.exec('pnpm', args, {
        cwd,
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch (error) {
      const {stdout = '', stderr = ''} = error as {
        stdout?: string;
        stderr?: string;
      };
      throw new Error(
        `pnpm ${args.join(' ')} failed\n${stdout}${stderr}`.trim(),
      );
    }
  }

  private static readonly exec = promisify(execFile);

  private static rewriteFiles(
    root: string,
    enabled: Set<string>,
    name: string,
  ): void {
    for (const entry of readdirSync(root, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue;
      const file = join(entry.parentPath, entry.name);
      // The CLI's own source names the template it renames: leave it as is.
      if (
        CliConstants.UNTOUCHED.some((dir) =>
          relative(root, file).startsWith(dir),
        )
      ) {
        continue;
      }
      const raw = readFileSync(file);
      if (raw.subarray(0, 8000).includes(0)) continue; // binary
      const original = raw.toString('utf8');
      let text = original;
      if (MarkerStripper.hasMarkers(text)) {
        try {
          text = MarkerStripper.strip(text, enabled);
        } catch (error) {
          throw new Error(
            `${relative(root, file)}: ${(error as Error).message}`,
          );
        }
        if (/\.(ts|mts|cts)$/.test(file)) text = ImportPruner.prune(text);
      }
      text = text
        .replaceAll(CliConstants.TEMPLATE_SCOPE, `@${name}/`)
        .replaceAll(CliConstants.TEMPLATE_DOMAIN, `${name}.len`);
      if (text !== original) writeFileSync(file, text);
    }
  }

  private static dropDependencies(folder: string, names: string[]): void {
    const file = join(folder, 'package.json');
    if (!existsSync(file)) return;
    ProjectServiceImpl.editJson(file, (pkg) => {
      for (const field of ['dependencies', 'devDependencies']) {
        const deps = pkg[field] as Record<string, string> | undefined;
        for (const dependency of names) delete deps?.[dependency];
      }
    });
  }

  private static finishPackageJson(root: string, name: string): void {
    ProjectServiceImpl.editJson(join(root, 'package.json'), (pkg) => {
      pkg.name = name;
      // Template links point at the template's repository, not this project.
      for (const field of ['homepage', 'repository', 'bugs', 'author']) {
        delete pkg[field];
      }
    });
  }

  private static editJson(
    file: string,
    change: (json: Record<string, unknown>) => void,
  ): void {
    const json = JSON.parse(readFileSync(file, 'utf8')) as Record<
      string,
      unknown
    >;
    change(json);
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  }
}
