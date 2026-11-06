import {readFileSync} from 'node:fs';
import {basename, resolve} from 'node:path';
import {CliConstants} from '../constant/cli.constants.ts';
import type {CreateConfig} from '../model/create-options.ts';
import {FeatureManifest} from '../model/feature-manifest.ts';
import type {ProgressService} from '../service/progress.service.ts';
import type {ProjectService} from '../service/project.service.ts';
import type {PromptService} from '../service/prompt.service.ts';
import type {TemplateService} from '../service/template.service.ts';

export type CreateFlags = CreateConfig & {
  config?: string;
  template?: string;
  ref?: string;
  yes?: boolean;
  dryRun?: boolean;
};

/**
 * `create [dir]`: asks for whatever the flags leave out (only in an
 * interactive terminal), then writes, installs and formats the project.
 */
export class CreateCommand {
  private readonly templates: TemplateService;
  private readonly projects: ProjectService;
  private readonly prompts: PromptService;
  private readonly progress: ProgressService;
  private readonly interactive: boolean;

  constructor(
    templates: TemplateService,
    projects: ProjectService,
    prompts: PromptService,
    progress: ProgressService,
    interactive: boolean,
  ) {
    this.templates = templates;
    this.projects = projects;
    this.prompts = prompts;
    this.progress = progress;
    this.interactive = interactive;
  }

  async run(dir: string | undefined, flags: CreateFlags): Promise<void> {
    const options = CreateCommand.withConfigFile(flags);
    const ask = this.interactive && !options.yes;

    const folder =
      dir ??
      (ask
        ? await this.prompts.text(
            'Where should the project go?',
            'my-api',
            (v) => CreateCommand.validName(basename(v)),
          )
        : 'my-api');
    const target = resolve(folder);
    const name = CreateCommand.packageName(options.name ?? basename(target));

    let source = '';
    await this.progress.run([
      {
        title: 'Find the template',
        run: async () => {
          source = await this.templates.resolve(options.template, options.ref);
        },
      },
    ]);
    const manifest = FeatureManifest.load(source);
    const selection = await this.selection(manifest, options, ask);
    const enabled = manifest.resolve(selection);
    const install =
      options.install ??
      (ask ? await this.prompts.confirm('Install dependencies?', true) : true);

    const chosen = [...enabled].sort().join(', ') || 'core only';
    if (options.dryRun) {
      this.progress.summary('Dry run: nothing was written', [
        `Folder:   ${target}`,
        `Name:     ${name} (@${name}/*, https://api.${name}.len)`,
        `Features: ${chosen}`,
        `Removed:  ${
          manifest
            .disabled(enabled)
            .map((f) => f.id)
            .join(', ') || 'nothing'
        }`,
      ]);
      return;
    }

    await this.progress.run([
      {
        title: `Write ${folder} (${enabled.size} features)`,
        run: () =>
          this.projects.create({source, target, name, enabled, manifest}),
      },
      ...(install
        ? [
            {
              title: 'Install dependencies',
              run: () => this.projects.install(target),
            },
            {title: 'Format', run: () => this.projects.format(target)},
          ]
        : []),
    ]);
    this.progress.summary(`Created ${name}`, [
      `Features: ${chosen}`,
      '',
      `cd ${folder}`,
      ...(install
        ? []
        : ['pnpm install --no-frozen-lockfile && pnpm lint:fix']),
      `pnpm certs   local CA and *.${name}.len certificate (prints the hosts line)`,
      `pnpm dev     https://api.${name}.len/docs on port 443`,
      'pnpm eb generate resource <name>   add a resource',
    ]);
  }

  private async selection(
    manifest: FeatureManifest,
    options: CreateFlags,
    ask: boolean,
  ): Promise<string[]> {
    if (options.features) return options.features;
    if (options.preset) return manifest.preset(options.preset);
    if (!ask) return manifest.preset(CliConstants.DEFAULT_PRESET);
    const preset = await this.prompts.select('Which features?', [
      {label: 'standard (recommended)', value: 'standard'},
      {label: 'minimal: core only', value: 'minimal'},
      {label: 'full: everything', value: 'full'},
      {label: 'custom: pick each one', value: 'custom'},
    ]);
    if (preset !== 'custom') return manifest.preset(preset);
    return this.prompts.multiSelect(
      'Pick the features',
      manifest.features
        .filter((f) => f.group !== 'internal')
        .map((f) => ({label: `${f.group.padEnd(9)} ${f.title}`, value: f.id})),
      manifest.defaults(),
    );
  }

  /** Lowercase, npm-safe: used as @<name>/ scope and <name>.len domain. */
  static packageName(raw: string): string {
    const name = raw
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!name) throw new Error(`"${raw}" gives an empty project name`);
    return name;
  }

  private static validName(raw: string): string | null {
    return /[a-z0-9]/i.test(raw) ? null : 'Use letters or digits';
  }

  /** Flags win over the --config file; a config file means no prompts. */
  private static withConfigFile(flags: CreateFlags): CreateFlags {
    if (!flags.config) return flags;
    const file = JSON.parse(readFileSync(flags.config, 'utf8')) as CreateConfig;
    return {
      ...flags,
      name: flags.name ?? file.name,
      preset: flags.preset ?? file.preset,
      features: flags.features ?? file.features,
      install: flags.install ?? file.install,
      yes: flags.yes ?? true,
    };
  }
}
