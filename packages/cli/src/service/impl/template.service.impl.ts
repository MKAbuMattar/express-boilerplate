import {execFileSync} from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CliConstants} from '../../constant/cli.constants.ts';
import {FeatureManifest} from '../../model/feature-manifest.ts';
import {TemplateService} from '../template.service.ts';

/**
 * This repository when the CLI runs from a checkout (`pnpm eb create`), else
 * a GitHub tarball of `ref` (the published package). `--template <dir>`
 * overrides both.
 */
export class TemplateServiceImpl extends TemplateService {
  /**
   * The release tag this package was published from, so a CLI creates the
   * template it was built and tested with, not whatever main holds today.
   * An unreleased build (0.0.0) falls back to main.
   */
  static defaultRef(
    version: string = TemplateServiceImpl.packageVersion(),
  ): string {
    return version === '0.0.0' ? CliConstants.TEMPLATE_REF : `v${version}`;
  }

  private static packageVersion(): string {
    const file = join(TemplateServiceImpl.packageRoot(), 'package.json');
    return (JSON.parse(readFileSync(file, 'utf8')) as {version: string})
      .version;
  }

  /**
   * This package's folder: the nearest package.json above this module. Found
   * by walking up because the module sits at different depths in src/ and in
   * the published bundle (dist/main.js).
   */
  static packageRoot(from: string = fileURLToPath(import.meta.url)): string {
    let dir = dirname(from);
    while (!existsSync(join(dir, 'package.json'))) {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`No package.json above ${from}`);
      dir = parent;
    }
    return dir;
  }

  async resolve(
    template?: string,
    ref: string = TemplateServiceImpl.defaultRef(),
  ): Promise<string> {
    if (template) return TemplateServiceImpl.checked(resolve(template));
    // packages/cli -> the repository root, when run from a checkout.
    const checkout = resolve(TemplateServiceImpl.packageRoot(), '../..');
    if (FeatureManifest.exists(checkout)) return checkout;
    return TemplateServiceImpl.download(ref);
  }

  private static async download(ref: string): Promise<string> {
    const url = `https://codeload.github.com/${CliConstants.TEMPLATE_REPOSITORY}/tar.gz/${encodeURIComponent(ref)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Could not download the template (${response.status} ${url})`,
      );
    }
    const dir = mkdtempSync(join(tmpdir(), 'express-boilerplate-'));
    const archive = join(dir, 'template.tar.gz');
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    execFileSync('tar', ['-xzf', archive, '-C', dir]);
    const [root] = readdirSync(dir).filter(
      (entry) => entry !== 'template.tar.gz',
    );
    return TemplateServiceImpl.checked(join(dir, root ?? ''));
  }

  private static checked(dir: string): string {
    if (!FeatureManifest.exists(dir)) {
      throw new Error(
        `${dir} has no ${CliConstants.MANIFEST_FILE}; not a template`,
      );
    }
    return dir;
  }
}
