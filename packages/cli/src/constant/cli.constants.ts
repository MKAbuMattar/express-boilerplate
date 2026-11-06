export class CliConstants {
  static readonly USAGE = `Usage:
  eb                                             the app: menu, wizards, previews (in a terminal)
  create-express-boilerplate [dir] [options]     create a project (prompts when interactive)
  eb create [dir] [options]                      same, from a checkout or an installed CLI
  eb generate <kind> <name> [options]            alias: eb g; prompts for what is missing
     kinds: resource, entity, migration, repository, service, controller, endpoint,
            dto, guard, middleware, exception, enum, constant, job, test
  eb add <feature...> / eb remove <feature...>   change features after create (patch with git apply)
  eb features                                    list the features and presets
  eb info [--json]                               project, features, toolchain
  eb doctor [--json]                             check certs, hosts, port 443, pnpm, Docker
  eb routes [--json]                             every route the API serves
  eb migrate [run|revert|show]                   run, undo or list migrations
  eb completion bash|zsh                         shell completion script

Generate options:
  --fields <a:type,...>  string, text, int, boolean (resource, entity, dto, migration)
  -m, -r                 entity: also a migration, a repository
  --values <a,b>         enum members
  --status <code>        exception: HTTP status (default 422)
  --type <t>             test: unit, integration or security
  --auth <method>        jwt (default), mtls, hmac, oauth2, sso (resource, controller, endpoint)
  --public               no authentication on reads (resource, controller) or on the endpoint
  --method, --path       endpoint: e.g. --method POST --path /:id/approve
  --scope <scope>        endpoint: also require this scope, e.g. orders:approve
  --action <name>        endpoint: method name (default from the path)
  --skip-tests           no test file
  --dry-run, -d          print the plan, write nothing
  --force, -f            overwrite existing files

Create options:
  --preset <name>        minimal, standard or full
  --features <a,b,...>   exact feature list (requirements are added)
  --config <file.json>   {"name", "preset" | "features", "install"}
  --name <name>          package scope and local domain (<name>.len); default: dir name
  --template <dir>       template checkout to copy (default: this repo or GitHub)
  --ref <ref>            GitHub branch or tag when downloading (default: this CLI's release tag)
  --no-install           skip pnpm install and formatting
  --yes, -y              accept defaults, no prompts
  --dry-run, -d          show what would be written, write nothing`;

  /** At the template root: every optional feature and the presets. */
  static readonly MANIFEST_FILE = 'boilerplate.features.json';
  /** Written into a created project: the features it was made with. */
  static readonly RECORD_FILE = 'boilerplate.json';

  static readonly TEMPLATE_REPOSITORY = 'MKAbuMattar/express-boilerplate';
  static readonly TEMPLATE_REF = 'main';
  /** The template's own names, replaced by the project name. */
  static readonly TEMPLATE_SCOPE = '@express-boilerplate/';
  static readonly TEMPLATE_DOMAIN = 'express-boilerplate.len';

  /**
   * Copied but never rewritten: the CLI holds the template's own names
   * (TEMPLATE_SCOPE, marker examples) and must keep them to work later.
   */
  static readonly UNTOUCHED: readonly string[] = ['packages/cli/'];

  /** Never copied into a project: build output, local state, secrets. */
  static readonly SKIP: ReadonlySet<string> = new Set([
    'node_modules',
    'dist',
    'coverage',
    '.turbo',
    '.git',
    'certs',
    'graphify-out',
    '.serena',
    '.claude',
    '.env',
  ]);

  /** eb generate kinds, in the order the menu shows them. */
  static readonly GENERATORS: Readonly<
    Record<string, {description: string; fields?: boolean}>
  > = {
    resource: {
      description: 'CRUD through every layer: entity to REST resource and test',
      fields: true,
    },
    entity: {
      description: 'Entity (-m migration, -r repository)',
      fields: true,
    },
    migration: {
      description:
        'Migration; create_x_table, add_y_to_x, drop_y_from_x fill it in',
    },
    repository: {description: 'Repository for an existing entity'},
    service: {description: 'Service contract, @Service impl, @Bean and test'},
    controller: {description: 'Guarded REST resource with a test'},
    endpoint: {
      description:
        'One route on an existing controller, with its service method and test',
    },
    dto: {description: 'Validated input DTO', fields: true},
    guard: {description: 'Route guard with a test'},
    middleware: {description: 'Express middleware, registered, with a test'},
    exception: {description: 'Domain exception mapped to a status (--status)'},
    enum: {description: 'Enumeration (--values a,b)'},
    constant: {description: 'Constants class'},
    job: {description: 'Queue job: name, handler and test'},
    test: {description: 'Test skeleton (--type unit|integration|security)'},
  };

  static readonly DEFAULT_PRESET = 'standard';
  static readonly DEFAULT_FIELDS = 'name:string';
  static readonly FIELD_TYPES = ['string', 'text', 'int', 'boolean'] as const;
  static readonly RESERVED_FIELDS: readonly string[] = [
    'id',
    'createdAt',
    'updatedAt',
  ];
}
