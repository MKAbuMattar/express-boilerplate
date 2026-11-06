import {FeatureManifest} from '../model/feature-manifest.ts';
import type {
  FeatureChange,
  FeatureService,
} from '../service/feature.service.ts';
import type {ProgressService} from '../service/progress.service.ts';
import type {ProjectService} from '../service/project.service.ts';
import type {TemplateService} from '../service/template.service.ts';
import type {WorkspaceService} from '../service/workspace.service.ts';

/** `eb features`, `eb add <feature...>`, `eb remove <feature...>`. */
export class FeaturesCommand {
  private readonly templates: TemplateService;
  private readonly workspace: WorkspaceService;
  private readonly features: FeatureService;
  private readonly projects: ProjectService;
  private readonly progress: ProgressService;

  constructor(
    templates: TemplateService,
    workspace: WorkspaceService,
    features: FeatureService,
    projects: ProjectService,
    progress: ProgressService,
  ) {
    this.templates = templates;
    this.workspace = workspace;
    this.features = features;
    this.projects = projects;
    this.progress = progress;
  }

  async list(template?: string, ref?: string): Promise<void> {
    const manifest = FeatureManifest.load(
      await this.templates.resolve(template, ref),
    );
    for (const f of manifest.features) {
      const requires = f.requires?.length
        ? ` (needs ${f.requires.join(', ')})`
        : '';
      console.log(
        `${f.group.padEnd(10)} ${f.id.padEnd(16)} ${f.title}${requires}`,
      );
    }
    for (const [name, ids] of Object.entries(manifest.presets)) {
      const list = ids === '*' ? 'everything' : ids.join(', ') || 'core only';
      console.log(`preset ${name}: ${list}`);
    }
  }

  async change(
    mode: 'add' | 'remove',
    ids: string[],
    cwd: string,
    options: {
      dryRun?: boolean;
      install?: boolean;
      template?: string;
      ref?: string;
    },
  ): Promise<void> {
    if (ids.length === 0) throw new Error(`Usage: eb ${mode} <feature...>`);
    const root = this.workspace.root(cwd);
    let result: FeatureChange = {
      added: [],
      removed: [],
      files: [],
      conflicts: [],
    };
    await this.progress.run([
      {
        title: `${mode === 'add' ? 'Add' : 'Remove'} ${ids.join(', ')}`,
        run: async () => {
          result = await this.features.change(
            root,
            mode === 'add' ? ids : [],
            mode === 'remove' ? ids : [],
            {
              dryRun: Boolean(options.dryRun),
              template: options.template,
              ref: options.ref,
            },
          );
        },
      },
      ...(options.dryRun || options.install === false
        ? []
        : [
            {
              title: 'Install dependencies',
              run: () => this.projects.install(root),
            },
            {
              title: 'Format',
              // Biome cannot parse a file with <<<<<<< markers in it.
              run: () =>
                result.conflicts.length > 0
                  ? undefined
                  : this.projects.format(root),
            },
          ]),
    ]);
    this.progress.summary(
      options.dryRun ? 'Dry run: nothing changed' : 'Features changed',
      [
        `Added:   ${result.added.join(', ') || 'none'}`,
        `Removed: ${result.removed.join(', ') || 'none'}`,
        ...result.files.map((f) => `${f.action.padEnd(7)} ${f.path}`),
        ...(result.conflicts.length
          ? [
              'Resolve the <<<<<<< markers (your edits met the feature) in:',
              ...result.conflicts.map((f) => `  ${f}`),
            ]
          : []),
        ...(options.dryRun
          ? []
          : ['Next: pnpm lint && pnpm typecheck && pnpm test']),
      ],
    );
    if (result.conflicts.length > 0) process.exitCode = 1;
  }
}
