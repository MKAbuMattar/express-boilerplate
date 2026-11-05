---
name: verify-change
description: Check a change in express-boilerplate before calling it done. Use after editing code in apps/api or packages/*.
---

Run from the repo root, in order, and stop at the first failure:

1. `pnpm lint` (Biome, includes the layer import rule). Fix with `pnpm lint:fix`.
2. `pnpm typecheck`
3. `pnpm test`

Then check by hand:

- No new plaintext listener, port or URL. Everything stays TLS on 443 (see AGENTS.md, Security rules).
- A new route has a guard and scopes, or is added to the public list in `apps/api/test/security/route-audit.security.test.ts` on purpose.
- A schema change is a new migration in `packages/persistence/src/repository/migration/`, added to the end of `DatabaseConfig.migrations`.

Report what passed, and name anything you could not run (container tests need Docker).
