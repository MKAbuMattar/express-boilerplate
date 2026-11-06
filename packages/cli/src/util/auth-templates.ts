import type {AuthSpec} from '../model/auth.ts';
import {ImportPruner} from './import-pruner.ts';

/**
 * Turns the JWT-guarded route templates into routes for another
 * authentication method, and writes the matching test helpers.
 */
export class AuthTemplates {
  /** Rewrites a JWT route source for spec; publicReads drops the guard on GETs. */
  static route(
    source: string,
    spec: AuthSpec,
    scope: string,
    publicReads: boolean,
  ): string {
    let text = source;
    if (publicReads) {
      // A read guarded by authentication alone (no Scopes) becomes public.
      text = text.replace(
        /\n {2}@OasResponse\(\n {4}HttpStatusCode\.UNAUTHORIZED,\n {4}OpenApiConstants\.problem\('Missing or invalid JWT'\),\n {2}\)\n {2}@OasSecurity\(\{bearerAuth: \[\]\}\)\n {2}@UseGuard\(JwtGuard\)\n/g,
        '\n',
      );
      text = text.replace(
        /\n {2}@OasSecurity\(\{bearerAuth: \[\]\}\)\n {2}@UseGuard\(JwtGuard\)\n/g,
        '\n',
      );
      text = text.replace(/ \(JWT\)'\)/g, " (public)')");
    }
    // A public route needs no guard: drop the imports that leaves unused.
    if (spec.kind === 'jwt') return ImportPruner.prune(text);
    return ImportPruner.prune(
      text
        .replace(
          `import {JwtGuard} from '${scope}/common/security/jwt/jwt.guard.js';`,
          `import {${spec.guard}} from '${scope}/common/${spec.module}.js';`,
        )
        .replaceAll('JwtGuard', spec.guard)
        .replaceAll('{bearerAuth: []}', `{${spec.scheme}: []}`)
        .replaceAll(
          'Missing or invalid JWT',
          `Missing or invalid ${spec.label}`,
        )
        .replaceAll('(JWT', `(${spec.label}`)
        .replaceAll('Reads need a JWT', `Reads need ${spec.label}`),
    );
  }

  /** True when a test can call the route as an allowed client in-process. */
  static canCall(spec: AuthSpec): boolean {
    return spec.kind === 'jwt' || spec.kind === 'hmac';
  }

  /**
   * Test setup for an authenticated caller holding `scopeExpr` (a TS
   * expression). Defines `as(scopes)` returning headers for a request.
   */
  static testSetup(
    spec: AuthSpec,
    scope: string,
    scopeExpr: string,
  ): {
    imports: string;
    env: string;
    helper: string;
  } {
    if (spec.kind === 'hmac') {
      return {
        imports: `import {HmacGuard} from '${scope}/common/security/hmac/hmac.guard.js';`,
        env: `{HMAC_CLIENT_SCOPES: \`partner-a=\${${scopeExpr}}\`}`,
        helper: `  // Every signature is valid once, so each request gets its own timestamp.
  let sequence = 0;
  const signed = (method: string, url: string, body = '') => {
    const ts = \`\${Math.floor(Date.now() / 1000)}.\${String(++sequence).padStart(6, '0')}\`;
    return {
      'content-type': 'application/json',
      'x-client-id': 'partner-a',
      'x-timestamp': ts,
      'x-signature': HmacGuard.sign(TestApp.HMAC_SECRET, ts, method, url, body),
    };
  };`,
      };
    }
    return {
      imports: `import {TokenProvider} from '${scope}/common/security/jwt/token.provider.js';`,
      env: '{}',
      helper: `  let token = '';
  const signed = (_method: string, _url: string, _body = '') => ({
    'content-type': 'application/json',
    authorization: \`Bearer \${token}\`,
  });`,
    };
  }
}
