import type {AuthSpec} from '../model/auth.ts';
import {AuthTemplates} from './auth-templates.ts';

/** One route added to an existing controller by `eb g endpoint`. */
export type Endpoint = {
  /** Method name on the controller and the service, e.g. approve. */
  action: string;
  /** HTTP method in upper case. */
  method: string;
  /** Path under the controller, e.g. /:id/approve. */
  path: string;
  /** Path parameter names, in order. */
  params: string[];
  /** POST, PUT and PATCH take a JSON body. */
  hasBody: boolean;
  auth: AuthSpec;
  isPublic: boolean;
  /** Scope string and its ScopeConstants name, or null for none. */
  scope: {value: string; constant: string} | null;
  /** The controller has an injected service to put the logic in. */
  service: string | null;
};

export class EndpointTemplates {
  static readonly DECORATORS: Record<string, string> = {
    GET: 'Get',
    POST: 'Post',
    PUT: 'Put',
    PATCH: 'Patch',
    DELETE: 'Delete',
  };

  /** /:id/approve -> approve; /stats -> stats; /:id -> the method name. */
  static action(method: string, path: string): string {
    const words = path
      .split('/')
      .filter((part) => part && !part.startsWith(':'))
      .flatMap((part) => part.split(/[-_]/))
      .filter(Boolean);
    if (words.length === 0) return method.toLowerCase();
    return (
      words[0]!.toLowerCase() +
      words
        .slice(1)
        .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
        .join('')
    );
  }

  private static args(e: Endpoint): string {
    return [...e.params, ...(e.hasBody ? ['body'] : [])].join(', ');
  }

  /** The controller method, inserted before the class's closing brace. */
  static route(e: Endpoint, tag: string): string {
    const params = [
      ...e.params.map((p) => `    @Params({name: '${p}'}) ${p}: string,`),
      ...(e.hasBody ? ['    @Body() body: unknown,'] : []),
    ];
    const guards = e.isPublic
      ? []
      : [
          `  @OasSecurity({${e.auth.scheme}: []})`,
          `  @UseGuard(${[e.auth.guard, ...(e.scope ? [`Scopes.require(ScopeConstants.${e.scope.constant})`] : [])].join(', ')})`,
        ];
    const call = e.service
      ? `await this.service.${e.action}(${EndpointTemplates.args(e)})`
      : `{${[...e.params, ...(e.hasBody ? ['input: body'] : [])].join(', ')}}`;
    const who = e.isPublic
      ? 'public'
      : e.auth.label + (e.scope ? `, ${e.scope.value}` : '');
    return `
  @OasTag('${tag}')

  @OasSummary('${e.action} (${who})')
${e.params.map((p) => `  @OasParameter({name: '${p}', in: 'path', required: true, schema: {type: 'string'}})`).join('\n')}
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('${e.action} done'))
${
  e.isPublic
    ? ''
    : `  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.problem('Missing or invalid ${e.auth.label}'),
  )
`
}${guards.join('\n')}
  @${EndpointTemplates.DECORATORS[e.method]}('${e.path}')
  async ${e.action}(
${params.join('\n')}
  ): Promise<ApiResponse<unknown>> {
    return ApiResponse.ok('${e.action} done', ${call});
  }
`;
  }

  /** The service contract's abstract method. */
  static contract(e: Endpoint): string {
    const params = [
      ...e.params.map((p) => `${p}: string`),
      ...(e.hasBody ? ['body: unknown'] : []),
    ].join(', ');
    return `
  /** ${e.method} ${e.path}. */
  abstract ${e.action}(${params}): Promise<Record<string, unknown>>;
`;
  }

  /** The implementation stub: where the business logic goes. */
  static impl(e: Endpoint): string {
    const params = [
      ...e.params.map((p) => `${p}: string`),
      ...(e.hasBody ? ['body: unknown'] : []),
    ].join(', ');
    return `
  async ${e.action}(${params}): Promise<Record<string, unknown>> {
    // Business logic for ${e.method} ${e.path}: validate, load through the
    // repository, change, save. Throw NotFoundException, ConflictException
    // or ValidationException; the error filter turns them into 404/409/400.
    return {${[...e.params, ...(e.hasBody ? ['input: body'] : [])].join(', ')}};
  }
`;
  }

  static test(e: Endpoint, scope: string, base: string): string {
    const url = `${base}${e.path.replace(/:[a-zA-Z]\w*/g, '00000000-0000-0000-0000-000000000001')}`;
    const verb = e.method.toLowerCase();
    const anonymous =
      e.auth.kind === 'jwt' || e.auth.kind === 'hmac' ? '[401]' : '[401, 501]';
    const body = e.hasBody ? '{note: "x"}' : 'undefined';
    if (e.isPublic) {
      return `import request from 'supertest';
import {describe, expect, it} from 'vitest';
import {TestApp} from '../support/test-app.js';

describe('${e.method} ${base}${e.path}', () => {
  it('needs no authentication', async () => {
    const {application, app} = await TestApp.create();
    try {
      const response = await request(app).${verb}('${url}')${e.hasBody ? `.send(${body})` : ''};
      expect(response.status).toBe(200);
    } finally {
      await application.close();
    }
  });
});
`;
    }
    const scopeExpr = e.scope ? `ScopeConstants.${e.scope.constant}` : "''";
    const anonymousTest = `  it('refuses an anonymous caller', async () => {
    const response = await request(app).${verb}(url)${e.hasBody ? `.send(${body})` : ''};
    expect(${anonymous}).toContain(response.status);
  });`;
    if (!AuthTemplates.canCall(e.auth)) {
      return `import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {TestApp} from '../support/test-app.js';

/** ${e.auth.label}: an allowed call needs a real client; see the e2e tests. */
describe('${e.method} ${base}${e.path}', () => {
  const url = '${url}';
  let application: Application;
  let app: express.Application;

  beforeAll(async () => {
    ({application, app} = await TestApp.create());
  });
  afterAll(() => application.close());

${anonymousTest}
});
`;
    }
    const setup = AuthTemplates.testSetup(e.auth, scope, scopeExpr);
    return `${e.scope ? `import {ScopeConstants} from '${scope}/common/constant/scope.constants.js';\n` : ''}${setup.imports}
import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {TestApp} from '../support/test-app.js';

describe('${e.method} ${base}${e.path}', () => {
  const url = '${url}';
  let application: Application;
  let app: express.Application;
${setup.helper}

  beforeAll(async () => {
    ({application, app} = await TestApp.create(${setup.env}));
${
  e.auth.kind === 'jwt'
    ? `    token = await application.beans
      .getBean(TokenProvider)
      .createToken('caller', {scope: ${scopeExpr}});
`
    : ''
}  });
  afterAll(() => application.close());

${anonymousTest}

  it('answers an allowed caller', async () => {
    const raw = ${e.hasBody ? `JSON.stringify(${body})` : "''"};
    const response = await request(app)
      .${verb}(url)
      .set(signed('${e.method}', url, raw))${e.hasBody ? '\n      .send(raw)' : ''};
    expect(response.status).toBe(200);
  });
});
`;
  }
}
