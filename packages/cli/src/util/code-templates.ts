import type {AuthSpec} from '../model/auth.ts';
import type {Field} from '../model/field.ts';
import type {Names} from '../model/names.ts';
import {AuthTemplates} from './auth-templates.ts';

/** Kind of migration a name like create_orders_table asks for. */
export type MigrationIntent =
  | {kind: 'create'; table: string}
  | {kind: 'add'; table: string; column: string}
  | {kind: 'drop'; table: string; column: string}
  | {kind: 'blank'};

/**
 * Source text for the single-file generators. Each mirrors a class already
 * in the repo (JwtGuard, RateLimiter, DomainException, QueueConstants...).
 */
export class CodeTemplates {
  private readonly scope: string;
  private readonly n: Names;

  constructor(scope: string, names: Names) {
    this.scope = scope;
    this.n = names;
  }

  /** create_x_table, add_y_to_x, drop_y_from_x; anything else is blank. */
  static migrationIntent(snake: string): MigrationIntent {
    const create = /^create_([a-z0-9_]+)_table$/.exec(snake);
    if (create) return {kind: 'create', table: create[1]!};
    const add = /^add_([a-z0-9_]+?)_to_([a-z0-9_]+?)(?:_table)?$/.exec(snake);
    if (add) return {kind: 'add', column: add[1]!, table: add[2]!};
    const drop = /^drop_([a-z0-9_]+?)_from_([a-z0-9_]+?)(?:_table)?$/.exec(
      snake,
    );
    if (drop) return {kind: 'drop', column: drop[1]!, table: drop[2]!};
    return {kind: 'blank'};
  }

  /** Nullable unless the table is new: rows that exist must stay valid. */
  static migrationColumn(field: Field, nullable = true): string {
    const type =
      field.type === 'string'
        ? "'varchar', length: '255'"
        : `MigrationColumns.type(queryRunner, '${field.type}')`;
    return `{name: '${field.name}', type: ${type}${nullable ? ', isNullable: true' : ''}}`;
  }

  static migration(
    className: string,
    intent: MigrationIntent,
    fields: Field[],
    nullable = true,
  ): string {
    const {up, down, imports} = CodeTemplates.migrationBody(
      intent,
      fields,
      nullable,
    );
    return `import {${imports}} from 'typeorm';
${up.includes('MigrationColumns') ? "import {MigrationColumns} from './migration-columns.js';\n" : ''}
/** Never edit once shipped; add another migration instead. */
export class ${className} implements MigrationInterface {
  name = '${className}';

  async up(queryRunner: QueryRunner): Promise<void> {
${up}
  }

  async down(queryRunner: QueryRunner): Promise<void> {
${down}
  }
}
`;
  }

  private static migrationBody(
    intent: MigrationIntent,
    fields: Field[],
    nullable: boolean,
  ): {up: string; down: string; imports: string} {
    switch (intent.kind) {
      case 'create':
        return {
          imports: 'type MigrationInterface, type QueryRunner, Table',
          up: `    await queryRunner.createTable(
      new Table({
        name: '${intent.table}',
        columns: [
          {name: 'id', type: 'varchar', length: '36', isPrimary: true},
${fields.map((f) => `          ${CodeTemplates.migrationColumn(f, nullable)},`).join('\n')}
          MigrationColumns.createdAt(queryRunner),
          MigrationColumns.updatedAt(queryRunner),
        ],
      }),
    );`,
          down: `    await queryRunner.dropTable('${intent.table}');`,
        };
      case 'add': {
        const field = fields[0] ?? {
          name: intent.column,
          type: 'string' as const,
        };
        return {
          imports: 'type MigrationInterface, type QueryRunner, TableColumn',
          // Nullable, so rows that exist before the migration stay valid.
          up: `    await queryRunner.addColumn(
      '${intent.table}',
      new TableColumn(${CodeTemplates.migrationColumn(field)}),
    );`,
          down: `    await queryRunner.dropColumn('${intent.table}', '${field.name}');`,
        };
      }
      case 'drop':
        return {
          imports: 'type MigrationInterface, type QueryRunner',
          up: `    await queryRunner.dropColumn('${intent.table}', '${intent.column}');`,
          down: `    // Put the column back the way it was before this migration.
    throw new Error('${intent.column} cannot be restored automatically');`,
        };
      case 'blank':
        return {
          imports: 'type MigrationInterface, type QueryRunner',
          up: '    // await queryRunner.query(...);\n    void queryRunner;',
          down: '    void queryRunner;',
        };
    }
  }

  serviceContract(): string {
    return `/** Contract for ${this.n.kebab}. Abstract class, so it exists at runtime as a DI token. */
export abstract class ${this.n.pascal}Service {
  abstract run(input: string): Promise<string>;
}
`;
  }

  serviceImpl(): string {
    const {n, scope} = this;
    return `import {Service} from '${scope}/common/config/stereotypes.js';
import {${n.pascal}Service} from '../${n.kebab}.service.js';

@Service()
export class ${n.pascal}ServiceImpl extends ${n.pascal}Service {
  async run(input: string): Promise<string> {
    return input;
  }
}
`;
  }

  serviceTest(): string {
    const {n, scope} = this;
    return `import {${n.pascal}Service} from '${scope}/service/service/${n.kebab}.service.js';
import {describe, expect, it} from 'vitest';
import {TestApp} from '../support/test-app.js';

describe('${n.pascal}Service', () => {
  it('is bound to its implementation', async () => {
    const {application} = await TestApp.create();
    try {
      const service = application.beans.getBean(${n.pascal}Service);
      expect(await service.run('x')).toBe('x');
    } finally {
      await application.close();
    }
  });
});
`;
  }

  controller(): string {
    const {n, scope} = this;
    return `import {ApiConstants} from '${scope}/common/constant/api.constants.js';
import {OpenApiConstants} from '${scope}/common/constant/openapi.constants.js';
import {ApiResponse} from '${scope}/common/rest/dto/api-response.dto.js';
import {JwtGuard} from '${scope}/common/security/jwt/jwt.guard.js';
import {Controller, Get, HttpStatusCode, UseGuard} from '@inversifyjs/http-core';
import {
  OasResponse,
  OasSecurity,
  OasSummary,
  OasTag,
} from '@inversifyjs/http-open-api';

/** Every route needs a guard; add Scopes.require(...) for writes. */
@Controller(ApiConstants.V1_${n.constant})
export class ${n.pascal}V1Resource {
  @OasTag('${n.pluralPascal}')
  @OasSummary('${n.pluralPascal} (JWT)')
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('${n.pluralPascal}'))
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.problem('Missing or invalid JWT'),
  )
  @OasSecurity({bearerAuth: []})
  @UseGuard(JwtGuard)
  @Get()
  list(): ApiResponse<string[]> {
    return ApiResponse.ok('${n.pluralPascal}', []);
  }
}
`;
  }

  controllerTest(spec: AuthSpec, publicReads: boolean): string {
    const {n, scope} = this;
    const anonymous = AuthTemplates.anonymousStatuses(spec);
    if (publicReads || spec.kind !== 'jwt') {
      return `import request from 'supertest';
import {describe, expect, it} from 'vitest';
import {TestApp} from '../support/test-app.js';

describe('${n.pascal}V1Resource', () => {
  it('${publicReads ? 'needs no authentication' : `refuses an anonymous caller (${spec.label})`}', async () => {
    const {application, app} = await TestApp.create();
    try {
      const response = await request(app).get('/api/v1/${n.plural}');
      ${publicReads ? 'expect(response.status).toBe(200);' : `expect(${anonymous}).toContain(response.status);`}
    } finally {
      await application.close();
    }
  });
});
`;
    }
    return `import {TokenProvider} from '${scope}/common/security/jwt/token.provider.js';
import request from 'supertest';
import {describe, expect, it} from 'vitest';
import {TestApp} from '../support/test-app.js';

describe('${n.pascal}V1Resource', () => {
  it('needs a JWT', async () => {
    const {application, app} = await TestApp.create();
    try {
      const path = '/api/v1/${n.plural}';
      expect((await request(app).get(path)).status).toBe(401);
      const token = await application.beans
        .getBean(TokenProvider)
        .createToken('t', TestApp.ALL_SCOPES);
      const ok = await request(app).get(path).auth(token, {type: 'bearer'});
      expect(ok.status).toBe(200);
    } finally {
      await application.close();
    }
  });
});
`;
  }

  guard(): string {
    const {n} = this;
    return `import type {ExpressGuard} from '@inversifyjs/http-express';
import type {Request} from 'express';
import {Component} from '../../config/stereotypes.js';
import {AuthException} from '../../exceptions/auth.exception.js';
import {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';

/**
 * Lets a request through when the authentication guard before it set a
 * principal. Put your rule in allows(); use it after JwtGuard:
 * @UseGuard(JwtGuard, ${n.pascal}Guard)
 */
@Component()
export class ${n.pascal}Guard implements ExpressGuard {
  async activate(request: Request): Promise<boolean> {
    if (!request.principal || !${n.pascal}Guard.allows(request)) {
      throw AuthException.unauthorized(AuthStrategy.Jwt, '${n.kebab} denied');
    }
    return true;
  }

  static allows(request: Request): boolean {
    return Boolean(request.principal?.subject);
  }
}
`;
  }

  guardTest(): string {
    const {n, scope} = this;
    return `import {AuthStrategy} from '${scope}/common/enumeration/auth-strategy.enum.js';
import {Principal} from '${scope}/common/security/principal.js';
import {${n.pascal}Guard} from '${scope}/common/security/${n.kebab}/${n.kebab}.guard.js';
import type {Request} from 'express';
import {describe, expect, it} from 'vitest';

describe('${n.pascal}Guard', () => {
  const guard = new ${n.pascal}Guard();

  it('allows a caller with a principal', async () => {
    const request = {principal: new Principal(AuthStrategy.Jwt, 'alice')};
    expect(await guard.activate(request as Request)).toBe(true);
  });

  it('refuses a caller without one', async () => {
    await expect(guard.activate({} as Request)).rejects.toBeDefined();
  });
});
`;
  }

  middleware(): string {
    const {n, scope} = this;
    return `import type {AppConfig} from '${scope}/common/config/app.config.js';
import type {RequestHandler} from 'express';

/** Registered in Application.init, before the routes. */
export class ${n.pascal}Middleware {
  static handler(_config: AppConfig): RequestHandler {
    return (_request, _response, next) => {
      next();
    };
  }
}
`;
  }

  middlewareTest(): string {
    const {n, scope} = this;
    return `import {AppConfig} from '${scope}/common/config/app.config.js';
import {describe, expect, it, vi} from 'vitest';
import {${n.pascal}Middleware} from '../../src/config/web/${n.kebab}.middleware.js';

describe('${n.pascal}Middleware', () => {
  it('passes the request on', () => {
    const next = vi.fn();
    ${n.pascal}Middleware.handler(new AppConfig({NODE_ENV: 'test'}))(
      {} as never,
      {} as never,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
`;
  }

  exception(status: number): string {
    const {n} = this;
    return `import {DomainException} from './domain.exception.js';

/** Mapped to ${status} problem details by GlobalExceptionFilter. */
export class ${n.pascal}Exception extends DomainException {}
`;
  }

  exceptionTest(status: number): string {
    const {n, scope} = this;
    return `import {DomainException} from '${scope}/common/exceptions/domain.exception.js';
import {${n.pascal}Exception} from '${scope}/common/exceptions/${n.kebab}.exception.js';
import {describe, expect, it} from 'vitest';

describe('${n.pascal}Exception', () => {
  it('is a domain error the filter maps to ${status}', () => {
    const error = new ${n.pascal}Exception('nope');
    expect(error).toBeInstanceOf(DomainException);
    expect(error.name).toBe('${n.pascal}Exception');
  });
});
`;
  }

  enumeration(values: string[]): string {
    const member = (v: string) =>
      v
        .split(/[-_\s]+/)
        .map((w) => w[0]!.toUpperCase() + w.slice(1))
        .join('');
    return `export enum ${this.n.pascal} {
${values.map((v) => `  ${member(v)} = '${v}',`).join('\n')}
}
`;
  }

  constants(): string {
    return `export class ${this.n.pascal}Constants {
  static readonly NAME = '${this.n.kebab}';
}
`;
  }

  job(): string {
    const {n} = this;
    return `    // ${n.kebab}: payload in, throw to retry; dead-lettered after QUEUE_ATTEMPTS.
    this.broker.process(QueueConstants.${n.singularConstant}, async (payload) => {
      logger.info({payload}, '${n.kebab} done');
    });

`;
  }

  jobTest(): string {
    const {n, scope} = this;
    const constant = n.singularConstant;
    return `import {QueueBroker} from '${scope}/common/config/queue/queue-broker.js';
import {QueueConstants} from '${scope}/common/constant/queue.constants.js';
import {describe, expect, it, vi} from 'vitest';
import {TestApp} from '../support/test-app.js';

describe('${n.kebab} job', () => {
  it('is processed without dead-lettering', async () => {
    const {application} = await TestApp.create({QUEUE_BACKOFF_MS: '5'});
    try {
      const broker = application.beans.getBean(QueueBroker);
      expect(QueueConstants.NAMES).toContain(QueueConstants.${constant});
      await broker.enqueue(QueueConstants.${constant}, {ok: true});
      await vi.waitFor(async () =>
        expect(await broker.deadLetters(QueueConstants.${constant})).toEqual([]),
      );
    } finally {
      await application.close();
    }
  });
});
`;
  }

  test(type: string): string {
    const {n} = this;
    if (type === 'unit') {
      return `import {describe, expect, it} from 'vitest';

describe('${n.pascal}', () => {
  it('works', () => {
    expect(true).toBe(true);
  });
});
`;
    }
    return `import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {TestApp} from '../support/test-app.js';

describe('${n.pascal}', () => {
  let application: Application;
  let app: express.Application;

  beforeAll(async () => {
    ({application, app} = await TestApp.create());
  });
  afterAll(() => application.close());

  it('answers health checks', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
  });
});
`;
  }
}
