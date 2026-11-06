import {CliConstants} from '../constant/cli.constants.ts';
import {Auths} from '../model/auth.ts';
import {type Field, Fields} from '../model/field.ts';
import type {GenerateOptions} from '../model/generate-options.ts';
import type {AppliedFile, Plan} from '../model/plan.ts';
import type {GeneratorService} from '../service/generator.service.ts';
import type {ProgressService, Task} from '../service/progress.service.ts';
import type {PromptService} from '../service/prompt.service.ts';
import type {WorkspaceService} from '../service/workspace.service.ts';

export type GenerateFlags = {
  auth?: string;
  public?: boolean;
  method?: string;
  path?: string;
  scope?: string;
  action?: string;
  fields?: string;
  values?: string;
  status?: string;
  type?: string;
  migration?: boolean;
  repository?: boolean;
  skipTests?: boolean;
  dryRun?: boolean;
  force?: boolean;
};

/**
 * `eb generate <kind> <name>` (alias `eb g`). In a terminal, whatever is
 * missing is asked for; elsewhere it is a usage error.
 */
export class GenerateCommand {
  private readonly workspace: WorkspaceService;
  private readonly generators: GeneratorService;
  private readonly prompts: PromptService;
  private readonly progress: ProgressService;
  private readonly interactive: boolean;

  constructor(
    workspace: WorkspaceService,
    generators: GeneratorService,
    prompts: PromptService,
    progress: ProgressService,
    interactive: boolean,
  ) {
    this.workspace = workspace;
    this.generators = generators;
    this.prompts = prompts;
    this.progress = progress;
    this.interactive = interactive;
  }

  async run(args: string[], cwd: string, flags: GenerateFlags): Promise<void> {
    const root = this.workspace.root(cwd);
    const kind = args[0] ?? (await this.ask('kind', () => this.chooseKind()));
    const name =
      args[1] ??
      (await this.ask('name', () =>
        this.prompts.text(
          kind === 'migration' ? 'Migration name' : `Name of the ${kind}`,
          kind === 'migration' ? 'create_orders_table' : 'order',
          (v) =>
            /^[a-zA-Z][\w-]*$/.test(v) ? null : 'Letters, digits, - or _',
        ),
      ));
    const options = await this.options(kind, name, flags);
    const plan = this.generators.plan(kind, root, options);

    if (flags.dryRun) {
      const applied = this.workspace.apply(root, plan, {
        dryRun: true,
        force: true,
      });
      this.progress.summary(`Dry run: ${kind} ${name} (nothing written)`, [
        ...applied.flatMap((f) => [
          `${f.kind.padEnd(9)} ${f.path}`,
          ...f.added
            .filter((l) => l.trim())
            .slice(0, 12)
            .map((l) => `  + ${l}`),
        ]),
        ...plan.notes,
      ]);
      return;
    }
    const overwritten = flags.force
      ? plan.files.filter(
          (f) => f.kind === 'create' && this.workspace.exists(root, f.path),
        )
      : [];
    if (overwritten.length > 0) {
      plan.note(
        `--force replaced ${overwritten.length} existing file(s); your edits in them are gone (check git diff).`,
      );
    }
    const write = GenerateCommand.write(
      this.workspace,
      root,
      plan,
      Boolean(flags.force),
    );
    await this.progress.run(write.tasks);
    this.progress.summary(`Generated ${kind} ${name}`, write.lines());
  }

  /** Write and format the plan; lines() reports what was written. */
  static write(
    workspace: WorkspaceService,
    root: string,
    plan: Plan,
    force: boolean,
  ): {tasks: Task[]; lines: () => string[]} {
    let applied: AppliedFile[] = [];
    return {
      tasks: [
        {
          title: `Write ${plan.files.length} files`,
          run: () => {
            applied = workspace.apply(root, plan, {dryRun: false, force});
          },
        },
        {
          title: 'Format',
          run: () =>
            workspace.format(
              root,
              applied.map((f) => f.path),
            ),
        },
      ],
      lines: () => [
        ...applied.map((f) => `${f.kind.padEnd(9)} ${f.path}`),
        ...plan.notes,
        'Next: pnpm test',
      ],
    };
  }

  /** Kinds that take --fields; a migration only when it creates or adds. */
  static wantsFields(kind: string, name: string): boolean {
    return (
      Boolean(CliConstants.GENERATORS[kind]?.fields) ||
      (kind === 'migration' && /^(create|add)_/.test(name))
    );
  }

  static kindChoices(): {label: string; value: string}[] {
    return Object.entries(CliConstants.GENERATORS).map(([value, g]) => ({
      label: `${value.padEnd(11)} ${g.description}`,
      value,
    }));
  }

  private async options(
    kind: string,
    name: string,
    flags: GenerateFlags,
  ): Promise<GenerateOptions> {
    let fieldSpec = flags.fields;
    if (
      !fieldSpec &&
      GenerateCommand.wantsFields(kind, name) &&
      this.interactive
    ) {
      fieldSpec = await this.prompts.text(
        'Fields (name:type, types: string, text, int, boolean)',
        CliConstants.DEFAULT_FIELDS,
        (v) => Fields.errorOf(() => Fields.parse(v)),
      );
    }
    let values = Fields.list(flags.values);
    if (kind === 'enum' && !values.length && this.interactive) {
      values = Fields.list(
        await this.prompts.text('Members, comma-separated', 'active,inactive'),
      );
    }
    const fields: Field[] = Fields.parse(
      fieldSpec ?? CliConstants.DEFAULT_FIELDS,
    );
    return {
      name,
      fields,
      values,
      status: Number(flags.status ?? 422),
      migration: Boolean(flags.migration),
      repository: Boolean(flags.repository),
      testType: flags.type ?? 'integration',
      skipTests: Boolean(flags.skipTests),
      auth: Auths.parse(flags.auth),
      publicReads: Boolean(flags.public),
      method: flags.method ?? 'GET',
      path: flags.path ?? '/',
      scope: flags.scope ?? null,
      action: flags.action ?? null,
    };
  }

  private chooseKind(): Promise<string> {
    return this.prompts.select(
      'What should be generated?',
      GenerateCommand.kindChoices(),
    );
  }

  private ask<T>(what: string, prompt: () => Promise<T>): Promise<T> {
    if (!this.interactive) {
      throw new Error(`Missing ${what}. Usage: eb generate <kind> <name>`);
    }
    return prompt();
  }
}
