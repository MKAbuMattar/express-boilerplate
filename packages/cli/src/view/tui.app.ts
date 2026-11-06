import {basename} from 'node:path';
import {Spinner} from '@inkjs/ui';
import {Box} from 'ink';
import {Component, createElement as h, type ReactElement} from 'react';
import type {CliConfiguration} from '../config/cli.configuration.ts';
import {CliConstants} from '../constant/cli.constants.ts';
import {CreateCommand} from '../controller/create.command.ts';
import {DoctorCommand} from '../controller/doctor.command.ts';
import {GenerateCommand} from '../controller/generate.command.ts';
import {InfoCommand} from '../controller/info.command.ts';
import {Auths} from '../model/auth.ts';
import {FeatureManifest} from '../model/feature-manifest.ts';
import {Fields} from '../model/field.ts';
import type {GenerateOptions} from '../model/generate-options.ts';
import {Names} from '../model/names.ts';
import type {AppliedFile, Plan} from '../model/plan.ts';
import {ProjectRecord} from '../model/project-record.ts';
import type {Task} from '../service/progress.service.ts';
import {CliView} from './cli.view.ts';
import {Runner} from './runner.view.ts';
import {type Answers, type Step, Wizard} from './wizard.view.ts';

type Screen =
  | {name: 'home'}
  | {name: 'loading'; title: string; load: () => Promise<Screen>}
  | {name: 'wizard'; title: string; steps: Step[]; next: (a: Answers) => Screen}
  | {
      name: 'confirm';
      title: string;
      lines: string[];
      question: string;
      yes: () => Screen;
    }
  | {name: 'run'; title: string; tasks: Task[]; result: () => Screen}
  | {name: 'result'; title: string; lines: string[]; failed?: boolean};

type Props = {
  cli: CliConfiguration;
  /** Open on this flow instead of the menu (npx create-express-boilerplate). */
  start?: 'create';
  cwd: string;
  template?: string;
  ref?: string;
  onExit: () => void;
};
type State = {screen: Screen; nonce: number};
type Project = {root: string; name: string; features: string[]};

/**
 * The full-screen terminal app behind a bare `eb`: a menu, then every
 * command as a short checklist with a badge per step, a preview, and a
 * result panel. The same services back the flag-driven CLI.
 */
export class TuiApp extends Component<Props, State> {
  override state: State = {
    screen: this.props.start === 'create' ? this.createFlow() : {name: 'home'},
    nonce: 0,
  };
  private manifest: FeatureManifest | null = null;
  /** The nonce whose loading screen has started, so it loads once. */
  private loaded = -1;
  private source = '';

  private go(screen: Screen): void {
    this.setState(({nonce}) => ({screen, nonce: nonce + 1}));
  }

  private project(): Project | null {
    try {
      const root = this.props.cli.workspaceService.root(this.props.cwd);
      const {name, features} = ProjectRecord.read(root) ?? {
        name: 'express-boilerplate',
        features: [],
      };
      return {root, name, features};
    } catch {
      return null;
    }
  }

  private async loadManifest(): Promise<FeatureManifest> {
    if (!this.manifest) {
      this.source = await this.props.cli.templateService.resolve(
        this.props.template,
        this.props.ref,
      );
      this.manifest = FeatureManifest.load(this.source);
    }
    return this.manifest;
  }

  private fail(title: string, error: unknown): Screen {
    return {
      name: 'result',
      title,
      lines: [error instanceof Error ? error.message : String(error)],
      failed: true,
    };
  }

  // --- home -------------------------------------------------------------

  private home(): Screen {
    const project = this.project();
    const items = project
      ? [
          ['generate', 'Generate code (resource, endpoint, service, ...)'],
          ['add', 'Add a feature'],
          ['remove', 'Remove a feature'],
          ['info', 'Project info'],
          ['doctor', 'Doctor: is this machine ready?'],
          ['routes', 'Routes'],
          ['create', 'Create another project'],
          ['quit', 'Quit'],
        ]
      : [
          ['create', 'Create a project'],
          ['features', 'List the features'],
          ['quit', 'Quit'],
        ];
    return {
      name: 'wizard',
      title: 'menu',
      steps: [
        {
          key: 'menu',
          badge: 'menu',
          label: 'What do you want to do?',
          kind: 'select',
          options: () =>
            items.map(([value, label]) => ({value: value!, label: label!})),
        },
      ],
      next: (a) => this.route(a.menu as string),
    };
  }

  private route(choice: string): Screen {
    switch (choice) {
      case 'create':
        return this.createFlow();
      case 'generate':
        return this.generateFlow();
      case 'add':
      case 'remove':
        return this.featureFlow(choice);
      case 'info':
        return this.infoScreen();
      case 'doctor':
        return this.loading('Doctor', async () => {
          const checks = await this.props.cli.doctor.checks(this.props.cwd);
          return {
            name: 'result',
            title: 'Doctor',
            lines: DoctorCommand.lines(checks),
            failed: checks.some((c) => c.required && !c.ok),
          };
        });
      case 'routes':
        return this.loading('Routes', async () => ({
          name: 'result',
          title: 'Routes',
          lines: await this.props.cli.project.routeLines(this.props.cwd),
        }));
      case 'features':
        return this.loading('Features', async () => {
          const m = await this.loadManifest();
          return {
            name: 'result',
            title: 'Features',
            lines: m.features
              .filter((f) => f.group !== 'internal')
              .map((f) => `${f.group.padEnd(9)} ${f.id.padEnd(14)} ${f.title}`),
          };
        });
      default:
        this.props.onExit();
        return {name: 'home'};
    }
  }

  private loading(title: string, load: () => Promise<Screen>): Screen {
    return {name: 'loading', title, load};
  }

  // --- create -----------------------------------------------------------

  private createFlow(): Screen {
    return this.loading('Find the template', async () => {
      const manifest = await this.loadManifest();
      return {
        name: 'wizard',
        title: 'Create a project',
        steps: [
          {
            key: 'dir',
            badge: 'dir',
            label: 'Where should the project go?',
            kind: 'text',
            placeholder: './my-api',
            validate: (v) => CreateCommand.validName(basename(v)),
          },
          {
            key: 'preset',
            badge: 'tmpl',
            label: 'Which features?',
            kind: 'select',
            options: () => CliConstants.PRESET_CHOICES,
          },
          {
            key: 'features',
            badge: 'feat',
            label: 'Pick the features',
            kind: 'multi',
            when: (a) => a.preset === 'custom',
            options: () => manifest.choices(),
            selected: () => manifest.defaults(),
          },
          {
            key: 'deps',
            badge: 'deps',
            label: 'Install dependencies?',
            kind: 'confirm',
          },
        ],
        next: (a) => this.createRun(manifest, a),
      };
    });
  }

  private createRun(manifest: FeatureManifest, a: Answers): Screen {
    const {projectService} = this.props.cli;
    const folder = a.dir as string;
    const target = `${this.props.cwd}/${folder}`.replace(/\/\.\//g, '/');
    const name = CreateCommand.packageName(basename(target));
    const enabled = manifest.resolve(
      a.preset === 'custom'
        ? (a.features as string[])
        : manifest.preset(a.preset as string),
    );
    const install = a.deps as boolean;
    const project = {source: this.source, target, name, enabled, manifest};
    return {
      name: 'run',
      title: `Create ${name}`,
      tasks: CreateCommand.tasks(projectService, project, folder, install),
      result: () => ({
        name: 'result',
        title: `Liftoff: ${name} is ready`,
        lines: CreateCommand.nextSteps(project, folder, install),
      }),
    };
  }

  // --- generate ---------------------------------------------------------

  private generateFlow(): Screen {
    const project = this.project()!;
    const ws = this.props.cli.workspaceService;
    const auths = [
      ...Object.values(Auths.SPECS)
        .filter((s) =>
          ws.exists(project.root, `packages/common/src/${s.module}.ts`),
        )
        .map((s) => ({value: s.kind as string, label: s.label})),
      {value: 'public', label: 'public (no authentication)'},
    ];
    const has = (kind: string, ...kinds: string[]) => kinds.includes(kind);
    const steps: Step[] = [
      {
        key: 'kind',
        badge: 'kind',
        label: 'What should be generated?',
        kind: 'select',
        options: () => GenerateCommand.kindChoices(),
      },
      {
        key: 'name',
        badge: 'name',
        label: 'Name',
        kind: 'text',
        when: (a) => !has(a.kind as string, 'endpoint', 'migration'),
        placeholder: 'order',
        validate: (v) => Fields.errorOf(() => new Names(v)),
      },
      {
        key: 'name',
        badge: 'name',
        label:
          'Migration name (create_x_table, add_y_to_x, drop_y_from_x, or any)',
        kind: 'text',
        when: (a) => a.kind === 'migration',
        placeholder: 'create_orders_table',
      },
      {
        key: 'name',
        badge: 'ctrl',
        label: 'Which controller gets the endpoint?',
        kind: 'select',
        when: (a) => a.kind === 'endpoint',
        options: () => this.controllers(project.root),
      },
      {
        key: 'method',
        badge: 'verb',
        label: 'HTTP method',
        kind: 'select',
        when: (a) => a.kind === 'endpoint',
        options: () =>
          ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({
            value: m,
            label: m,
          })),
      },
      {
        key: 'path',
        badge: 'path',
        label: 'Path under the controller',
        kind: 'text',
        when: (a) => a.kind === 'endpoint',
        placeholder: '/:id/approve',
      },
      {
        key: 'fields',
        badge: 'cols',
        label: 'Fields (name:type; string, text, int, boolean)',
        kind: 'text',
        when: (a) =>
          GenerateCommand.wantsFields(a.kind as string, String(a.name)),
        placeholder: CliConstants.DEFAULT_FIELDS,
        validate: (v) => Fields.errorOf(() => Fields.parse(v)),
      },
      {
        key: 'auth',
        badge: 'auth',
        label: 'Who may call it?',
        kind: 'select',
        when: (a) =>
          has(a.kind as string, 'resource', 'controller', 'endpoint'),
        options: () => auths,
      },
      {
        key: 'scope',
        badge: 'scope',
        label: 'Required scope (empty for none)',
        kind: 'text',
        when: (a) => a.kind === 'endpoint' && a.auth !== 'public',
        placeholder: '',
      },
      {
        key: 'values',
        badge: 'vals',
        label: 'Members, comma-separated',
        kind: 'text',
        when: (a) => a.kind === 'enum',
        placeholder: 'active,inactive',
      },
      {
        key: 'status',
        badge: 'code',
        label: 'HTTP status for this error',
        kind: 'text',
        when: (a) => a.kind === 'exception',
        placeholder: '422',
        validate: (v) =>
          /^[1-5]\d\d$/.test(v) ? null : 'A status like 402 or 409',
      },
      {
        key: 'type',
        badge: 'type',
        label: 'Test type',
        kind: 'select',
        when: (a) => a.kind === 'test',
        options: () =>
          ['unit', 'integration', 'security'].map((t) => ({
            value: t,
            label: t,
          })),
      },
      {
        key: 'migration',
        badge: 'mig',
        label: 'Also a migration?',
        kind: 'confirm',
        when: (a) => a.kind === 'entity',
      },
      {
        key: 'repository',
        badge: 'repo',
        label: 'Also a repository?',
        kind: 'confirm',
        when: (a) => a.kind === 'entity',
      },
    ];
    return {
      name: 'wizard',
      title: 'Generate code',
      steps,
      next: (a) => this.generatePreview(project, a),
    };
  }

  private controllers(root: string): {value: string; label: string}[] {
    const dir = `${root}/apps/api/src/rest/resources/v1`;
    return this.props.cli.workspaceService
      .list(dir)
      .filter((f) => f.endsWith('.resource.ts'))
      .map((f) => f.replace(/\.resource\.ts$/, ''))
      .map((n) => ({value: n, label: n}));
  }

  private generatePreview(project: Project, a: Answers): Screen {
    const {generatorService, workspaceService} = this.props.cli;
    const kind = a.kind as string;
    const options: GenerateOptions = {
      name: a.name as string,
      fields: Fields.parse((a.fields as string) || CliConstants.DEFAULT_FIELDS),
      values: Fields.list(a.values as string | undefined),
      status: Number(a.status ?? 422),
      migration: Boolean(a.migration),
      repository: Boolean(a.repository),
      testType: (a.type as string) ?? 'integration',
      skipTests: false,
      auth: Auths.parse(
        a.auth === 'public' || !a.auth ? 'jwt' : (a.auth as string),
      ),
      publicReads: a.auth === 'public',
      method: (a.method as string) ?? 'GET',
      path: (a.path as string) || '/',
      scope: (a.scope as string) || null,
      action: null,
    };
    let plan: Plan;
    let preview: AppliedFile[];
    try {
      plan = generatorService.plan(kind, project.root, options);
      preview = workspaceService.apply(project.root, plan, {
        dryRun: true,
        force: false,
      });
    } catch (error) {
      return this.fail(`Generate ${kind}`, error);
    }
    return {
      name: 'confirm',
      title: `Generate ${kind} ${options.name}`,
      lines: [
        ...preview.map((f) => `${f.kind.padEnd(9)} ${f.path}`),
        ...plan.notes,
      ],
      question: 'Write these files?',
      yes: () => {
        const write = GenerateCommand.write(
          workspaceService,
          project.root,
          plan,
          false,
        );
        return {
          name: 'run',
          title: `Generate ${kind} ${options.name}`,
          tasks: write.tasks,
          result: () => ({
            name: 'result',
            title: `Generated ${kind} ${options.name}`,
            lines: write.lines(),
          }),
        };
      },
    };
  }

  // --- add / remove -------------------------------------------------------

  private featureFlow(mode: 'add' | 'remove'): Screen {
    const project = this.project()!;
    return this.loading('Find the template', async () => {
      const manifest = await this.loadManifest();
      const enabled = manifest.resolve(project.features);
      const choices = manifest.choices((f) =>
        mode === 'add' ? !enabled.has(f.id) : enabled.has(f.id),
      );
      if (choices.length === 0) {
        return {
          name: 'result',
          title: mode === 'add' ? 'Add a feature' : 'Remove a feature',
          lines: [
            mode === 'add'
              ? 'Every feature is already on.'
              : 'No optional feature is on.',
          ],
        };
      }
      return {
        name: 'wizard',
        title: mode === 'add' ? 'Add a feature' : 'Remove a feature',
        steps: [
          {
            key: 'ids',
            badge: mode,
            label:
              mode === 'add'
                ? 'Which features to turn on?'
                : 'Which features to turn off?',
            kind: 'multi',
            options: () => choices,
          },
        ],
        next: (a) => this.featurePreview(project, mode, a.ids as string[]),
      };
    });
  }

  private featurePreview(
    project: Project,
    mode: 'add' | 'remove',
    ids: string[],
  ): Screen {
    if (ids.length === 0) return this.home();
    const {featureService, projectService} = this.props.cli;
    const add = mode === 'add' ? ids : [];
    const remove = mode === 'remove' ? ids : [];
    const opts = {template: this.props.template, ref: this.props.ref};
    return this.loading('Work out the changes', async () => {
      const dry = await featureService.change(project.root, add, remove, {
        dryRun: true,
        ...opts,
      });
      return {
        name: 'confirm',
        title: `${mode === 'add' ? 'Add' : 'Remove'} ${ids.join(', ')}`,
        lines: [
          `Added:   ${dry.added.join(', ') || 'none'}`,
          `Removed: ${dry.removed.join(', ') || 'none'}`,
          ...dry.files.map((f) => `${f.action.padEnd(7)} ${f.path}`),
        ],
        question: 'Apply? Your edits are kept; clashes get <<<<<<< markers',
        yes: () => {
          let conflicts: string[] = [];
          return {
            name: 'run',
            title: `${mode === 'add' ? 'Add' : 'Remove'} ${ids.join(', ')}`,
            tasks: [
              {
                title: 'Merge into the project',
                run: async () => {
                  conflicts = (
                    await featureService.change(project.root, add, remove, {
                      dryRun: false,
                      ...opts,
                    })
                  ).conflicts;
                },
              },
              {
                title: 'Install dependencies',
                run: () => projectService.install(project.root),
              },
              {
                title: 'Format',
                run: () =>
                  conflicts.length
                    ? undefined
                    : projectService.format(project.root),
              },
            ],
            result: () => ({
              name: 'result',
              title: conflicts.length
                ? 'Done, with conflicts to resolve'
                : 'Features changed',
              failed: conflicts.length > 0,
              lines: conflicts.length
                ? ['Resolve the <<<<<<< markers in:', ...conflicts]
                : ['Next: pnpm lint && pnpm typecheck && pnpm test'],
            }),
          };
        },
      };
    });
  }

  private infoScreen(): Screen {
    try {
      const info = this.props.cli.info.collect(this.props.cwd);
      return {
        name: 'result',
        title: String(info.project),
        lines: InfoCommand.lines(info),
      };
    } catch (error) {
      return this.fail('Project info', error);
    }
  }

  // --- render -------------------------------------------------------------

  private afterwards(): ReactElement {
    return h(Wizard, {
      key: `after-${this.state.nonce}`,
      steps: [
        {
          key: 'then',
          badge: 'next',
          label: 'Then?',
          kind: 'select',
          options: () => [
            {value: 'home', label: 'Back to the menu'},
            {value: 'quit', label: 'Quit'},
          ],
        },
      ],
      onDone: (a: Answers) =>
        a.then === 'home' ? this.go(this.home()) : this.props.onExit(),
    });
  }

  private body(screen: Screen): ReactElement {
    switch (screen.name) {
      case 'home':
        return this.body(this.home());
      case 'loading':
        return h(
          Box,
          {marginLeft: CliView.GUTTER},
          h(Spinner, {label: screen.title}),
        );
      case 'wizard':
        return h(Wizard, {
          key: `wizard-${this.state.nonce}`,
          steps: screen.steps,
          onDone: (a: Answers) => {
            try {
              this.go(screen.next(a));
            } catch (error) {
              this.go(this.fail(screen.title, error));
            }
          },
        });
      case 'confirm':
        return h(
          Box,
          {flexDirection: 'column'},
          CliView.summary(screen.title, screen.lines),
          h(Wizard, {
            key: `confirm-${this.state.nonce}`,
            steps: [
              {key: 'ok', badge: 'go', label: screen.question, kind: 'confirm'},
            ],
            onDone: (a: Answers) => this.go(a.ok ? screen.yes() : this.home()),
          }),
        );
      case 'run':
        return h(Runner, {
          key: `run-${this.state.nonce}`,
          tasks: screen.tasks,
          onDone: (error: Error | null) =>
            this.go(error ? this.fail(screen.title, error) : screen.result()),
        });
      case 'result':
        return h(
          Box,
          {flexDirection: 'column'},
          CliView.summary(
            screen.title,
            screen.lines,
            screen.failed ? 'red' : 'green',
            'marginBottom',
          ),
          this.afterwards(),
        );
    }
  }

  override componentDidMount(): void {
    this.componentDidUpdate();
  }

  override componentDidUpdate(): void {
    const {screen, nonce} = this.state;
    if (screen.name === 'loading' && this.loaded !== nonce) {
      this.loaded = nonce;
      screen.load().then(
        (next) => this.go(next),
        (error) => this.go(this.fail(screen.title, error)),
      );
    }
  }

  override render(): ReactElement {
    const project = this.project();
    return h(
      Box,
      {flexDirection: 'column', paddingY: 1},
      CliView.banner(
        project ? `${project.name}` : 'express-boilerplate',
        project
          ? `${project.features.join(', ') || 'core only'}  ·  ${project.root}`
          : 'No project here yet: create one.',
      ),
      this.body(this.state.screen),
    );
  }
}
