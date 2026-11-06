import {CliConstants} from '../../constant/cli.constants.ts';
import type {GenerateOptions} from '../../model/generate-options.ts';
import {Names} from '../../model/names.ts';
import {type Change, Plan} from '../../model/plan.ts';
import {AuthTemplates} from '../../util/auth-templates.ts';
import {CodeTemplates} from '../../util/code-templates.ts';
import {
  type Endpoint,
  EndpointTemplates,
} from '../../util/endpoint-templates.ts';
import {ResourceTemplates} from '../../util/resource-templates.ts';
import {GeneratorService} from '../generator.service.ts';
import type {WorkspaceService} from '../workspace.service.ts';

/**
 * Plans each kind of generated code the way the repo already writes it,
 * plus the registrations that make it live: DatabaseConfig, @Bean methods,
 * Application.controllers, ApiConstants, ScopeConstants, OpenAPI tags,
 * GlobalExceptionFilter, QueueConstants and JobRegistry.
 */
export class GeneratorServiceImpl extends GeneratorService {
  static readonly P = 'packages/persistence/src';
  static readonly S = 'packages/service/src';
  static readonly C = 'packages/common/src';
  static readonly A = 'apps/api/src';
  static readonly T = 'apps/api/test';

  private readonly workspace: WorkspaceService;

  constructor(workspace: WorkspaceService) {
    super();
    this.workspace = workspace;
  }

  /** The project being planned for; set at the start of each plan(). */
  private root = '';

  plan(kind: string, root: string, options: GenerateOptions): Plan {
    this.root = root;
    if (!(kind in CliConstants.GENERATORS)) {
      const kinds = Object.keys(CliConstants.GENERATORS).join(', ');
      throw new Error(`Unknown kind "${kind}". Kinds: ${kinds}`);
    }
    const n = new Names(options.name);
    const scope = this.workspace.scope(root);
    const stamp = Date.now();
    const r = new ResourceTemplates(scope, n, options.fields, stamp);
    const c = new CodeTemplates(scope, n);
    const plan = new Plan();
    const {P, S, C, A, T} = GeneratorServiceImpl;
    const test = (path: string, content: string) => {
      if (!options.skipTests) plan.create(`${T}/${path}`, content);
    };

    switch (kind) {
      case 'resource':
        this.entity(plan, r, n, true);
        plan.create(`${P}/repository/${n.kebab}.repository.ts`, r.repository());
        plan.create(`${S}/dto/create-${n.kebab}.dto.ts`, r.createDto());
        this.service(plan, n, r.contract(), r.impl());
        plan.create(`${A}/rest/dto/v1/${n.kebab}.dto.ts`, r.dto());
        plan.create(`${A}/converter/${n.kebab}.converter.ts`, r.converter());
        this.requireAuth(root, options);
        this.controller(
          plan,
          n,
          AuthTemplates.route(
            r.resource(),
            options.auth,
            scope,
            options.publicReads,
          ),
          true,
        );
        if (options.publicReads) {
          this.publicRoutes(plan, [
            `GET /api/v1/${n.plural}`,
            `GET /api/v1/${n.plural}/:id`,
          ]);
        }
        test(
          `integration/${n.kebab}.integration.test.ts`,
          r.test(options.auth, options.publicReads),
        );
        plan.note(
          `Routes: GET/POST /api/v1/${n.plural}, GET/PUT/DELETE /api/v1/${n.plural}/:id`,
        );
        plan.note(
          `${options.publicReads ? 'Reads are public; writes' : 'Every route'} need ${options.auth.label}; writes also the "${n.plural}:write" scope.`,
        );
        break;
      case 'entity':
        this.entity(plan, r, n, options.migration);
        if (options.repository) {
          plan.create(
            `${P}/repository/${n.kebab}.repository.ts`,
            r.repository(),
          );
        }
        break;
      case 'migration':
        this.migration(plan, options, stamp);
        break;
      case 'repository':
        if (!this.workspace.exists(root, `${P}/model/${n.kebab}.entity.ts`)) {
          throw new Error(
            `${P}/model/${n.kebab}.entity.ts not found: generate the entity first`,
          );
        }
        plan.create(`${P}/repository/${n.kebab}.repository.ts`, r.repository());
        break;
      case 'service':
        this.service(plan, n, c.serviceContract(), c.serviceImpl());
        test(
          `integration/${n.kebab}.service.integration.test.ts`,
          c.serviceTest(),
        );
        break;
      case 'controller':
        this.requireAuth(root, options);
        this.controller(
          plan,
          n,
          AuthTemplates.route(
            c.controller(),
            options.auth,
            scope,
            options.publicReads,
          ),
          false,
        );
        if (options.publicReads) {
          this.publicRoutes(plan, [`GET /api/v1/${n.plural}`]);
        }
        test(
          `integration/${n.kebab}.controller.integration.test.ts`,
          c.controllerTest(options.auth, options.publicReads),
        );
        break;
      case 'dto':
        plan.create(
          `${S}/dto/${n.kebab}.dto.ts`,
          r.createDto().replaceAll(`Create${n.pascal}Dto`, `${n.pascal}Dto`),
        );
        break;
      case 'guard':
        plan.create(`${C}/security/${n.kebab}/${n.kebab}.guard.ts`, c.guard());
        test(`unit/${n.kebab}.guard.unit.test.ts`, c.guardTest());
        plan.note(
          `Use it after authentication: @UseGuard(JwtGuard, ${n.pascal}Guard)`,
        );
        break;
      case 'middleware':
        plan.create(`${A}/config/web/${n.kebab}.middleware.ts`, c.middleware());
        plan.edit(
          `${A}/application.ts`,
          [
            'import',
            `import {${n.pascal}Middleware} from './config/web/${n.kebab}.middleware.js';`,
          ],
          [
            /(\n {4}if \(config\.isDevelopment\) this\.registerSwagger\(\);)/,
            (m) => `\n    app.use(${n.pascal}Middleware.handler(config));${m}`,
          ],
        );
        test(`unit/${n.kebab}.middleware.unit.test.ts`, c.middlewareTest());
        break;
      case 'exception':
        plan.create(
          `${C}/exceptions/${n.kebab}.exception.ts`,
          c.exception(options.status),
        );
        plan.edit(
          `${A}/exceptions/global-exception.filter.ts`,
          [
            'import',
            `import {${n.pascal}Exception} from '${scope}/common/exceptions/${n.kebab}.exception.js';`,
          ],
          [
            // Before the generic cases, so a subclass of one maps to its own status.
            /(\n {4}if \(error instanceof NotFoundException\) return 404;)/,
            (m) =>
              `\n    if (error instanceof ${n.pascal}Exception) return ${options.status};${m}`,
          ],
        );
        test(
          `unit/${n.kebab}.exception.unit.test.ts`,
          c.exceptionTest(options.status),
        );
        break;
      case 'enum':
        if (options.values.length === 0)
          throw new Error('--values a,b is required');
        plan.create(
          `${C}/enumeration/${n.kebab}.enum.ts`,
          c.enumeration(options.values),
        );
        break;
      case 'constant':
        plan.create(`${C}/constant/${n.kebab}.constants.ts`, c.constants());
        break;
      case 'job':
        plan.edit(`${C}/constant/queue.constants.ts`, [
          /(\n {2}static readonly NAMES: readonly string\[\] = \[)/,
          (m) =>
            `\n  static readonly ${n.singularConstant} = '${n.kebab}';${m}\n    QueueConstants.${n.singularConstant},`,
        ]);
        plan.edit(`${S}/service/job-registry.service.ts`, [
          /(\n {4}await this\.broker\.start\(\);)/,
          (m) => `\n${c.job().trimEnd()}${m}`,
        ]);
        test(`integration/${n.kebab}.job.integration.test.ts`, c.jobTest());
        break;
      case 'endpoint':
        this.endpoint(plan, root, scope, n, options);
        break;
      case 'test': {
        const type = options.testType;
        if (!['unit', 'integration', 'security'].includes(type)) {
          throw new Error('--type must be unit, integration or security');
        }
        plan.create(`${T}/${type}/${n.kebab}.${type}.test.ts`, c.test(type));
        break;
      }
    }
    return plan;
  }

  /** The guard must exist: features cut at create time are not there. */
  private requireAuth(root: string, options: GenerateOptions): void {
    const {auth, publicReads} = options;
    if (publicReads && options.auth.kind === 'jwt') return;
    if (
      !this.workspace.exists(
        root,
        `${GeneratorServiceImpl.C}/${auth.module}.ts`,
      )
    ) {
      throw new Error(
        `${auth.label} is not in this project. Turn it on first: eb add ${auth.feature}`,
      );
    }
  }

  /** Public routes are listed in the route audit test, or it fails. */
  private publicRoutes(plan: Plan, routes: string[]): void {
    plan.edit(
      `${GeneratorServiceImpl.T}/security/route-audit.security.test.ts`,
      [
        /(const PUBLIC_ROUTES = new Set\(\[)/,
        (m) =>
          `${m}\n${routes.map((r) => `  '${r}', // generated, public on purpose`).join('\n')}`,
      ],
    );
  }

  private endpoint(
    plan: Plan,
    root: string,
    scope: string,
    n: Names,
    options: GenerateOptions,
  ): void {
    const {A, S, C, T} = GeneratorServiceImpl;
    const resource = `${A}/rest/resources/v1/${n.kebab}.resource.ts`;
    if (!this.workspace.exists(root, resource)) {
      throw new Error(
        `${resource} not found: generate it first (eb g resource ${n.kebab} or eb g controller ${n.kebab})`,
      );
    }
    const method = options.method.toUpperCase();
    if (!(method in EndpointTemplates.DECORATORS)) {
      throw new Error('--method must be GET, POST, PUT, PATCH or DELETE');
    }
    const path = options.path.startsWith('/')
      ? options.path
      : `/${options.path}`;
    if (!/^(\/(:?[a-zA-Z][\w-]*))+$|^\/$/.test(path)) {
      throw new Error('--path like /:id/approve or /stats');
    }
    const isPublic = options.publicReads;
    if (!isPublic) this.requireAuth(root, options);
    const source = this.workspace.read(root, resource);
    const action = options.action ?? EndpointTemplates.action(method, path);
    if (new RegExp(`\\n {2}(async )?${action}\\(`).test(source)) {
      throw new Error(
        `${n.pascal}V1Resource already has ${action}(); use --action <name>`,
      );
    }
    const contract = `${S}/service/${n.kebab}.service.ts`;
    const service =
      source.includes('private readonly service:') &&
      this.workspace.exists(root, contract)
        ? `${n.pascal}Service`
        : null;
    const scopeConstants = this.workspace.read(
      root,
      `${C}/constant/scope.constants.ts`,
    );
    let scopeRef: {value: string; constant: string} | null = null;
    if (options.scope && !isPublic) {
      const value = options.scope;
      const existing = new RegExp(
        `static readonly (\\w+) = '${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}';`,
      ).exec(scopeConstants);
      const constant =
        existing?.[1] ?? value.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      scopeRef = {value, constant};
      if (!existing) {
        plan.edit(
          `${C}/constant/scope.constants.ts`,
          [
            /(\n {2}static readonly USERS_WRITE = [^\n]*)/,
            (m) => `${m}\n  static readonly ${constant} = '${value}';`,
          ],
          [
            /(\n {4}ScopeConstants\.USERS_WRITE,)/,
            (m) => `${m}\n    ScopeConstants.${constant},`,
          ],
        );
      }
    }
    const e: Endpoint = {
      action,
      method,
      path,
      params: [...path.matchAll(/:([a-zA-Z]\w*)/g)].map((m) => m[1]!),
      hasBody: ['POST', 'PUT', 'PATCH'].includes(method),
      auth: options.auth,
      isPublic,
      scope: scopeRef,
      service,
    };
    const tag = /@OasTag\('([^']+)'\)/.exec(source)?.[1] ?? n.pluralPascal;
    const core = `${scope}/common`;
    plan.edit(
      resource,
      [
        'named',
        `@inversifyjs/http-core|${[
          EndpointTemplates.DECORATORS[method],
          'HttpStatusCode',
          ...(e.params.length ? ['Params'] : []),
          ...(e.hasBody ? ['Body'] : []),
          ...(isPublic ? [] : ['UseGuard']),
        ].join(',')}`,
      ],
      [
        'named',
        `@inversifyjs/http-open-api|${['OasResponse', 'OasSummary', 'OasTag', ...(e.params.length ? ['OasParameter'] : []), ...(isPublic ? [] : ['OasSecurity'])].join(',')}`,
      ],
      ['named', `${core}/constant/openapi.constants.js|OpenApiConstants`],
      ['named', `${core}/rest/dto/api-response.dto.js|ApiResponse`],
      ...(isPublic
        ? []
        : [
            [
              'named',
              `${core}/${options.auth.module}.js|${options.auth.guard}`,
            ] as Change,
          ]),
      ...(scopeRef
        ? ([
            ['named', `${core}/security/authorization/scopes.js|Scopes`],
            ['named', `${core}/constant/scope.constants.js|ScopeConstants`],
          ] as Change[])
        : []),
      // Before the existing routes: Express matches in declaration order,
      // so /stats must come ahead of a generated /:id.
      source.includes('\n  ) {}\n')
        ? [/(\n {2}\) \{\}\n)/, (m) => `${m}${EndpointTemplates.route(e, tag)}`]
        : [
            new RegExp(`(export class ${n.pascal}V1Resource \\{\\n)`),
            (m) =>
              `${m}${EndpointTemplates.route(e, tag).replace(/^\n/, '')}\n`,
          ],
    );
    if (isPublic) {
      this.publicRoutes(plan, [`${method} /api/v1/${n.plural}${path}`]);
    }
    if (service) {
      plan.edit(contract, [
        /\n}\s*$/,
        () => `${EndpointTemplates.contract(e)}}\n`,
      ]);
      plan.edit(`${S}/service/impl/${n.kebab}.service.impl.ts`, [
        /\n}\s*$/,
        () => `${EndpointTemplates.impl(e)}}\n`,
      ]);
      plan.note(`Business logic goes in ${n.pascal}ServiceImpl.${action}().`);
    } else {
      plan.note(
        `${n.pascal}V1Resource has no service; the logic is inline in ${action}().`,
      );
    }
    if (!options.skipTests) {
      plan.create(
        `${T}/integration/${n.kebab}.${action}.integration.test.ts`,
        EndpointTemplates.test(e, scope, `/api/v1/${n.plural}`),
      );
    }
    plan.note(
      `Route: ${method} /api/v1/${n.plural}${path} (${isPublic ? 'public' : options.auth.label}${scopeRef ? `, scope ${scopeRef.value}` : ''})`,
    );
  }

  private entity(
    plan: Plan,
    r: ResourceTemplates,
    n: Names,
    withMigration: boolean,
  ): void {
    const {P} = GeneratorServiceImpl;
    plan.create(`${P}/model/${n.kebab}.entity.ts`, r.entity());
    plan.edit(
      `${P}/config/database.config.ts`,
      [
        'import',
        `import {${n.pascal}Entity} from '../model/${n.kebab}.entity.js';`,
      ],
      [
        /static readonly entities = \[([^\]]*)\]/,
        (m, list) =>
          list!.includes(`${n.pascal}Entity`)
            ? m
            : // Once the formatter puts one entity per line the list ends in
              // ",\n  "; appending after that would leave an empty slot.
              m.replace(
                list!,
                `${list!.replace(/[\s,]*$/, '')}, ${n.pascal}Entity`,
              ),
      ],
    );
    // Regenerating with --force keeps the shipped migration: a second
    // create-table migration for the same table would fail.
    if (
      withMigration &&
      this.workspace.exists(this.root, `${P}/model/${n.kebab}.entity.ts`)
    ) {
      plan.note(
        'Kept the existing migration; add one with eb g migration if the columns changed.',
      );
    } else if (withMigration) {
      plan.create(
        `${P}/repository/migration/${r.migrationFile}.ts`,
        r.migration(),
      );
      this.registerMigration(plan, r.migrationClass, r.migrationFile);
    }
  }

  private migration(plan: Plan, options: GenerateOptions, stamp: number): void {
    const snake = options.name.replace(/-/g, '_').toLowerCase();
    if (!/^[a-z][a-z0-9_]*$/.test(snake)) {
      throw new Error(
        'Name the migration in snake_case, e.g. add_status_to_orders',
      );
    }
    const words = snake.split('_');
    const className = `${words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join('')}${stamp}`;
    const file = `${stamp}-${snake.replace(/_/g, '-')}`;
    const intent = CodeTemplates.migrationIntent(snake);
    plan.create(
      `${GeneratorServiceImpl.P}/repository/migration/${file}.ts`,
      CodeTemplates.migration(className, intent, options.fields),
    );
    this.registerMigration(plan, className, file);
    if (intent.kind === 'blank') {
      plan.note('Blank migration: fill in up() and down().');
    }
  }

  private registerMigration(plan: Plan, className: string, file: string): void {
    plan.edit(
      `${GeneratorServiceImpl.P}/config/database.config.ts`,
      [
        'import',
        `import {${className}} from '../repository/migration/${file}.js';`,
      ],
      [
        /(static readonly migrations = \[[\s\S]*?)(\n {2}\];)/,
        (_m, head, tail) => `${head}\n    ${className},${tail}`,
      ],
    );
  }

  private service(plan: Plan, n: Names, contract: string, impl: string): void {
    const {S} = GeneratorServiceImpl;
    plan.create(`${S}/service/${n.kebab}.service.ts`, contract);
    plan.create(`${S}/service/impl/${n.kebab}.service.impl.ts`, impl);
    plan.edit(
      `${S}/config/service.configuration.ts`,
      [
        'import',
        `import {${n.pascal}ServiceImpl} from '../service/impl/${n.kebab}.service.impl.js';`,
      ],
      [
        'import',
        `import {${n.pascal}Service} from '../service/${n.kebab}.service.js';`,
      ],
      [
        /\n}\s*$/,
        () => `

  @Bean(${n.pascal}Service)
  ${n.camel}Service(beans: BeanFactory): ${n.pascal}Service {
    return beans.getBean(${n.pascal}ServiceImpl);
  }
}
`,
      ],
    );
  }

  private controller(
    plan: Plan,
    n: Names,
    source: string,
    withScope: boolean,
  ): void {
    const {A, C} = GeneratorServiceImpl;
    plan.create(`${A}/rest/resources/v1/${n.kebab}.resource.ts`, source);
    plan.edit(
      `${A}/application.ts`,
      [
        'import',
        `import {${n.pascal}V1Resource} from './rest/resources/v1/${n.kebab}.resource.js';`,
      ],
      [/(\n {4}UserV1Resource,)/, (m) => `${m}\n    ${n.pascal}V1Resource,`],
    );
    plan.edit(`${C}/constant/api.constants.ts`, [
      /(\n {2}static readonly V1_USERS = [^\n]*)/,
      (m) =>
        `${m}\n  static readonly V1_${n.constant} = \`\${ApiConstants.API_V1}/${n.plural}\`;`,
    ]);
    if (withScope) {
      plan.edit(
        `${C}/constant/scope.constants.ts`,
        [
          /(\n {2}static readonly USERS_WRITE = [^\n]*)/,
          (m) =>
            `${m}\n  static readonly ${n.constant}_WRITE = '${n.plural}:write';`,
        ],
        [
          /(\n {4}ScopeConstants\.USERS_WRITE,)/,
          (m) => `${m}\n    ScopeConstants.${n.constant}_WRITE,`,
        ],
      );
    }
    plan.edit(`${A}/config/openapi.config.ts`, [
      /(\n {4}\{name: 'Users v1'[^\n]*)/,
      (m) =>
        `${m}\n    {name: '${n.pluralPascal}', description: '${n.pluralPascal} (generated).'},`,
    ]);
  }
}
