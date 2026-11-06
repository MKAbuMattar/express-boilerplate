# create-expresso

The project CLI. Two jobs:

- **`create`**: a new project with only the features you pick.
- **`generate`**: inside a project, scaffold code through every layer.

Depends on nothing in the workspace. The terminal UI uses `ink`, `@inkjs/ui` and `react`; everything else is Node (`parseArgs`, `fs`, `child_process`) plus `git` for `add`/`remove`. Node runs `src/main.ts` directly with type stripping, so `pnpm eb` needs no build. `pnpm build` bundles everything into one `dist/main.js` with esbuild, so the published package has no dependencies to install and behaves the same under npx, `pnpm dlx`, yarn and bun.

## The app

Run `eb` (or `npx create-expresso`) in a terminal and you get a full-screen app instead of flags: a menu, then each job as a short checklist. Every answered step stays on screen next to its badge (`dir`, `tmpl`, `feat`, `deps`, `kind`, `auth`...), then a preview of every file it will write, a confirm, live progress, and a result panel that goes back to the menu.

```
 eb      shop
         auth-hmac, redis, websocket  ·  ~/work/shop

 menu    What do you want to do? Generate code
 kind    What should be generated? endpoint
 ctrl    Which controller gets the endpoint? order
 verb    HTTP method POST
 path    Path under the controller /:id/approve
 auth    Who may call it? HMAC
 scope   Required scope (empty for none) orders:approve
```

Inside a project the menu offers generate, add or remove a feature, info, doctor, routes and create; outside one, create and the feature list. Every command below also runs with flags, which is what CI and scripts use; without a terminal there are no prompts.

## Commands

Run with `npx create-expresso <command>` (or `pnpm dlx`), or with `pnpm eb <command>` inside a project. In a terminal, anything you leave out is asked for; in CI or a pipe, a missing argument is an error and progress prints as plain lines.

| Command                                    | Does                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `create [dir]`                             | New project with the features you pick; `--preset`, `--features`, `--config`, `-d`         |
| `generate <kind> <name>` (`g`)             | Code through the layers, registered where the app looks for it; `-d`, `-f`, `--skip-tests` |
| `add <feature...>` / `remove <feature...>` | Change features after create, merging into your edits (conflicts get `<<<<<<<` markers)    |
| `features`                                 | Every feature, what it needs, and the presets                                              |
| `info [--json]`                            | Project, scope, domain, features, toolchain versions                                       |
| `doctor [--json]`                          | Node, pnpm, certificates, the `*.len` hosts entry, port 443, Docker; exits 1 on a failure  |
| `routes [--json]`                          | Every route the API serves                                                                 |
| `migrate [run\|revert\|show]`              | Run, undo or list migrations                                                               |
| `completion bash\|zsh`                     | Shell completion; `eb completion zsh > ~/.zfunc/_eb`                                       |

### Generators

| Kind         | Writes                                                                                              | Registers                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `resource`   | entity, repository, migration, DTOs, service + impl, converter, REST resource, test                 | entity, migration, `@Bean`, controller, route constant, scope, OpenAPI tag |
| `entity`     | entity; `-m` a migration, `-r` a repository                                                         | entity (and migration)                                                     |
| `migration`  | `create_x_table`, `add_y_to_x`, `drop_y_from_x` are filled in; other names are blank                | migration                                                                  |
| `repository` | repository for an existing entity                                                                   |                                                                            |
| `service`    | contract, `@Service` impl, test                                                                     | `@Bean`                                                                    |
| `controller` | guarded REST resource, test                                                                         | controller, route constant, OpenAPI tag                                    |
| `endpoint`   | one route on an existing controller, its service method stub (your business logic goes there), test | route, scope constant, public-route audit entry                            |
| `dto`        | validated input DTO                                                                                 |                                                                            |
| `guard`      | guard for `@UseGuard(JwtGuard, XGuard)`, test                                                       |                                                                            |
| `middleware` | Express middleware, test                                                                            | `app.use(...)` in `Application.init`                                       |
| `exception`  | domain exception (`--status 402`), test                                                             | status in `GlobalExceptionFilter`                                          |
| `enum`       | enumeration (`--values a,b`)                                                                        |                                                                            |
| `constant`   | constants class                                                                                     |                                                                            |
| `job`        | queue handler, test                                                                                 | queue name in `QueueConstants`, handler in `JobRegistry`                   |
| `test`       | test skeleton (`--type unit\|integration\|security`)                                                |                                                                            |

Authentication per route: `--auth jwt|mtls|hmac|oauth2|sso` on `resource`, `controller` and `endpoint` picks the guard and the OpenAPI scheme (JWT by default); `--public` drops it from reads (or from the endpoint) and lists the route in the route-audit test. `--scope orders:approve` on an endpoint also requires that scope, added to `ScopeConstants`. A method the project was created without is refused with the `eb add` command that turns it on.

```sh
eb g resource order --fields title:string,total:int --auth hmac     # HMAC-signed clients
eb g resource item --fields label:string --public                   # anyone reads, JWT writes
eb g endpoint order --method POST --path /:id/approve --auth hmac --scope orders:approve
eb g endpoint order --method GET --path /stats --public
eb g endpoint invoice --method POST --path /:id/pay --auth mtls
```

New endpoints go ahead of the controller's existing routes, so `/stats` is not taken by `/:id`. Running a generator again never duplicates a registration; `--force` replaces the generated files (your edits in them too) and keeps an existing migration.

`--fields title:string,views:int,paid:boolean,body:text` sets the columns for `resource`, `entity`, `dto` and `migration`. Every run plans first: `--dry-run` prints the files and the lines it would add, and a real run writes nothing unless every registration finds its place. An existing file is overwritten only with `--force`.

## How `create` removes a feature

`boilerplate.features.json` at the repository root lists each feature: the files it owns (`remove`), the packages only it uses (`dependencies`), and the features it needs (`requires`). Hidden features (`group: "internal"`) are pulled in by others, such as `sso` by OIDC and SAML.

Code shared with other features is cut by markers, on comment lines in any syntax:

```ts
// @feature:redis
if (CACHE_TYPE === CacheType.Redis) return new RedisCacheStore(url);
// @end:redis
// @feature:!redis
//~ fallback used only when redis is off; the //~ is removed
// @end:!redis
```

`ProjectServiceImpl` then drops imports the cut left unused (`ImportPruner`), renames `@express-boilerplate/` and `express-boilerplate.len` to the project name, prunes the lockfile through `pnpm install`, and writes `boilerplate.json` with the chosen features.

The template itself has every feature on, so it must lint, typecheck and pass its tests as is; CI also generates the `minimal`, `standard` and `full` presets and runs the same checks on each.

## Adding a feature

1. Add an entry to `boilerplate.features.json` (id, title, group, `remove`, `dependencies`, `requires`).
2. Mark every block of shared code with `@feature:<id>` / `@end:<id>`, tests and env files included. Removing a block must leave valid code: no unused variable, parameter or private member (use a `@feature:!<id>` fallback when it would).
3. Check: `pnpm eb create /tmp/x --features <id>` and `--preset minimal`, then `pnpm lint && pnpm typecheck && pnpm test` in each.

## Publishing

The release workflow publishes this package to npm after each release, versioned like the release (`3.1.0` for tag `v3.1.0`), with provenance. A published CLI downloads the template from its own tag, so `npx create-expresso@3.1.0` always creates the 3.1.0 template. `--ref main` takes the newest, `--template <dir>` a local checkout or fork. It needs an `NPM_TOKEN` repository secret.

Check a build locally before a release:

```sh
pnpm --filter create-expresso pack --pack-destination /tmp/eb
cd /tmp && npx --package=/tmp/eb/create-expresso-0.0.0.tgz create-expresso my-api --template <this repo>
```

## Scripts

`build` (bundle to `dist/main.js`), `typecheck`, `test`.
