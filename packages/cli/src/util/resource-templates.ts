import type {AuthSpec} from '../model/auth.ts';
import type {Field} from '../model/field.ts';
import type {Names} from '../model/names.ts';
import {AuthTemplates} from './auth-templates.ts';

/**
 * Source text for each file `eb generate resource` writes. Every template
 * mirrors the user resource, so generated code reads like the hand-written
 * code next to it.
 */
export class ResourceTemplates {
  private readonly scope: string;
  private readonly n: Names;
  private readonly fields: Field[];
  readonly stamp: number;

  constructor(scope: string, names: Names, fields: Field[], stamp: number) {
    this.scope = scope;
    this.n = names;
    this.fields = fields;
    this.stamp = stamp;
  }

  /** File name of the migration, without extension. */
  get migrationFile(): string {
    return `${this.stamp}-create-${this.n.plural}-table`;
  }

  get migrationClass(): string {
    return `Create${this.n.pluralPascal}Table${this.stamp}`;
  }

  private column(field: Field): string {
    switch (field.type) {
      case 'string':
        return `@Column('varchar', {length: 255})\n  ${field.name}!: string;`;
      case 'text':
        return `@Column('text')\n  ${field.name}!: string;`;
      case 'int':
        return `@Column('int')\n  ${field.name}!: number;`;
      case 'boolean':
        return `@Column('boolean')\n  ${field.name}!: boolean;`;
    }
  }

  private tsType(field: Field): string {
    return field.type === 'int'
      ? 'number'
      : field.type === 'boolean'
        ? 'boolean'
        : 'string';
  }

  entity(): string {
    const {n} = this;
    return `import {randomUUID} from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

// Column types are explicit so no code depends on emitted design:type metadata.
@Entity('${n.table}')
export class ${n.pascal}Entity {
  @PrimaryColumn('varchar', {length: 36})
  id!: string;

${this.fields.map((f) => `  ${this.column(f)}`).join('\n\n')}

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  assignId(): void {
    if (!this.id) this.id = randomUUID();
  }
}
`;
  }

  repository(): string {
    const {n, scope} = this;
    return `import {Repository} from '${scope}/common/config/stereotypes.js';
import {inject} from 'inversify';
import {DataSource, type Repository as OrmRepository} from 'typeorm';
import {${n.pascal}Entity} from '../model/${n.kebab}.entity.js';

@Repository()
export class ${n.pascal}Repository {
  private readonly orm: OrmRepository<${n.pascal}Entity>;

  constructor(@inject(DataSource) dataSource: DataSource) {
    this.orm = dataSource.getRepository(${n.pascal}Entity);
  }

  findAll(): Promise<${n.pascal}Entity[]> {
    return this.orm.find({order: {createdAt: 'ASC'}});
  }

  findById(id: string): Promise<${n.pascal}Entity | null> {
    return this.orm.findOneBy({id});
  }

  save(fields: Partial<${n.pascal}Entity>): Promise<${n.pascal}Entity> {
    return this.orm.save(this.orm.create(fields));
  }

  update(
    entity: ${n.pascal}Entity,
    changes: Partial<${n.pascal}Entity>,
  ): Promise<${n.pascal}Entity> {
    return this.orm.save(Object.assign(entity, changes));
  }

  async remove(entity: ${n.pascal}Entity): Promise<void> {
    await this.orm.remove(entity);
  }
}
`;
  }

  migration(): string {
    const {n} = this;
    const col = (f: Field) => {
      switch (f.type) {
        case 'string':
          return `{name: '${f.name}', type: 'varchar', length: '255'}`;
        case 'text':
          return `{name: '${f.name}', type: MigrationColumns.type(queryRunner, 'text')}`;
        case 'int':
          return `{name: '${f.name}', type: MigrationColumns.type(queryRunner, 'int')}`;
        case 'boolean':
          return `{name: '${f.name}', type: MigrationColumns.type(queryRunner, 'boolean')}`;
      }
    };
    return `import {type MigrationInterface, type QueryRunner, Table} from 'typeorm';
import {MigrationColumns} from './migration-columns.js';

/** The ${n.table} table (generated). Never edit once shipped; add a migration. */
export class Create${n.pluralPascal}Table${this.stamp} implements MigrationInterface {
  name = 'Create${n.pluralPascal}Table${this.stamp}';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: '${n.table}',
        columns: [
          {name: 'id', type: 'varchar', length: '36', isPrimary: true},
${this.fields.map((f) => `          ${col(f)},`).join('\n')}
          MigrationColumns.createdAt(queryRunner),
          MigrationColumns.updatedAt(queryRunner),
        ],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('${n.table}');
  }
}
`;
  }

  createDto(): string {
    const {n, scope} = this;
    const check = (f: Field) => {
      switch (f.type) {
        case 'string':
          return `    if (typeof input.${f.name} !== 'string' || input.${f.name}.trim().length < 1 || input.${f.name}.length > 255) {
      errors.${f.name} = 'must be a string of 1 to 255 characters';
    }`;
        case 'text':
          return `    if (typeof input.${f.name} !== 'string') {
      errors.${f.name} = 'must be a string';
    }`;
        case 'int':
          return `    if (!Number.isInteger(input.${f.name})) {
      errors.${f.name} = 'must be an integer';
    }`;
        case 'boolean':
          return `    if (typeof input.${f.name} !== 'boolean') {
      errors.${f.name} = 'must be true or false';
    }`;
      }
    };
    return `import {ValidationException} from '${scope}/common/exceptions/domain.exception.js';

/** Validated input for creating or replacing a ${n.kebab}. */
export class Create${n.pascal}Dto {
  private constructor(
${this.fields.map((f) => `    readonly ${f.name}: ${this.tsType(f)},`).join('\n')}
  ) {}

  /** Validates untrusted input; throws with every failing field. */
  static from(body: unknown): Create${n.pascal}Dto {
    const input = (
      typeof body === 'object' && body !== null ? body : {}
    ) as Record<string, unknown>;
    const errors: Record<string, string> = {};
${this.fields.map(check).join('\n')}
    if (Object.keys(errors).length > 0) throw new ValidationException(errors);
    return new Create${n.pascal}Dto(
${this.fields.map((f) => `      input.${f.name} as ${this.tsType(f)},`).join('\n')}
    );
  }
}
`;
  }

  contract(): string {
    const {n, scope} = this;
    return `import type {${n.pascal}Entity} from '${scope}/persistence/model/${n.kebab}.entity.js';
import type {Create${n.pascal}Dto} from '../dto/create-${n.kebab}.dto.js';

/** Contract for ${n.kebab} operations. Abstract class, so it exists at runtime as a DI token. */
export abstract class ${n.pascal}Service {
  abstract findAll(): Promise<${n.pascal}Entity[]>;
  /** Throws NotFoundException when there is none. */
  abstract findById(id: string): Promise<${n.pascal}Entity>;
  abstract create(dto: Create${n.pascal}Dto): Promise<${n.pascal}Entity>;
  abstract replace(id: string, dto: Create${n.pascal}Dto): Promise<${n.pascal}Entity>;
  abstract delete(id: string): Promise<void>;
}
`;
  }

  impl(): string {
    const {n, scope} = this;
    return `import {Service} from '${scope}/common/config/stereotypes.js';
import {NotFoundException} from '${scope}/common/exceptions/domain.exception.js';
import type {${n.pascal}Entity} from '${scope}/persistence/model/${n.kebab}.entity.js';
import {${n.pascal}Repository} from '${scope}/persistence/repository/${n.kebab}.repository.js';
import {inject} from 'inversify';
import type {Create${n.pascal}Dto} from '../../dto/create-${n.kebab}.dto.js';
import {${n.pascal}Service} from '../${n.kebab}.service.js';

@Service()
export class ${n.pascal}ServiceImpl extends ${n.pascal}Service {
  constructor(
    @inject(${n.pascal}Repository)
    private readonly repository: ${n.pascal}Repository,
  ) {
    super();
  }

  findAll(): Promise<${n.pascal}Entity[]> {
    return this.repository.findAll();
  }

  async findById(id: string): Promise<${n.pascal}Entity> {
    const entity = await this.repository.findById(id);
    if (!entity) throw new NotFoundException('${n.pascal} not found');
    return entity;
  }

  create(dto: Create${n.pascal}Dto): Promise<${n.pascal}Entity> {
    return this.repository.save({...dto});
  }

  async replace(id: string, dto: Create${n.pascal}Dto): Promise<${n.pascal}Entity> {
    return this.repository.update(await this.findById(id), {...dto});
  }

  async delete(id: string): Promise<void> {
    await this.repository.remove(await this.findById(id));
  }
}
`;
  }

  dto(): string {
    const {n} = this;
    return `/** v1 public shape of a ${n.kebab}. Keeps the API stable when the entity changes. */
export class ${n.pascal}V1Dto {
  constructor(
    readonly id: string,
${this.fields.map((f) => `    readonly ${f.name}: ${this.tsType(f)},`).join('\n')}
    readonly createdAt: string,
    readonly updatedAt: string,
  ) {}
}
`;
  }

  converter(): string {
    const {n, scope} = this;
    return `import type {${n.pascal}Entity} from '${scope}/persistence/model/${n.kebab}.entity.js';
import {${n.pascal}V1Dto} from '../rest/dto/v1/${n.kebab}.dto.js';

export class ${n.pascal}Converter {
  static toDto(entity: ${n.pascal}Entity): ${n.pascal}V1Dto {
    return new ${n.pascal}V1Dto(
      String(entity.id),
${this.fields.map((f) => `      entity.${f.name},`).join('\n')}
      new Date(entity.createdAt).toISOString(),
      new Date(entity.updatedAt).toISOString(),
    );
  }

  static toDtoList(entities: ${n.pascal}Entity[]): ${n.pascal}V1Dto[] {
    return entities.map((entity) => ${n.pascal}Converter.toDto(entity));
  }
}
`;
  }

  resource(): string {
    const {n, scope} = this;
    const schemaType = (f: Field) =>
      f.type === 'int'
        ? 'integer'
        : f.type === 'boolean'
          ? 'boolean'
          : 'string';
    const properties = this.fields
      .map((f) => `      ${f.name}: {type: '${schemaType(f)}'},`)
      .join('\n');
    const tag = n.pluralPascal;
    return `import {ApiConstants} from '${scope}/common/constant/api.constants.js';
import {OpenApiConstants} from '${scope}/common/constant/openapi.constants.js';
import {ScopeConstants} from '${scope}/common/constant/scope.constants.js';
import {ApiResponse} from '${scope}/common/rest/dto/api-response.dto.js';
import {Scopes} from '${scope}/common/security/authorization/scopes.js';
import {JwtGuard} from '${scope}/common/security/jwt/jwt.guard.js';
import {Create${n.pascal}Dto} from '${scope}/service/dto/create-${n.kebab}.dto.js';
import {${n.pascal}Service} from '${scope}/service/service/${n.kebab}.service.js';
import {
  Body,
  Controller,
  CreatedHttpResponse,
  Delete,
  Get,
  HttpStatusCode,
  NoContentHttpResponse,
  Params,
  Post,
  Put,
  UseGuard,
} from '@inversifyjs/http-core';
import {
  OasParameter,
  OasRequestBody,
  OasResponse,
  OasSecurity,
  OasSummary,
  OasTag,
} from '@inversifyjs/http-open-api';
import {inject} from 'inversify';
import {${n.pascal}Converter} from '../../../converter/${n.kebab}.converter.js';
import type {${n.pascal}V1Dto} from '../../dto/v1/${n.kebab}.dto.js';

/** Reads need a JWT; writes also need the ${n.plural}:write scope. */
@Controller(ApiConstants.V1_${n.constant})
export class ${n.pascal}V1Resource {
  private static readonly SCHEMA = {
    type: 'object',
    properties: {
      id: {type: 'string', format: 'uuid'},
${properties.replace(/^ {6}/gm, '      ')}
      createdAt: {type: 'string', format: 'date-time'},
      updatedAt: {type: 'string', format: 'date-time'},
    },
  } as const;
  private static readonly BODY = {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: [${this.fields.map((f) => `'${f.name}'`).join(', ')}],
          properties: {
${properties.replace(/^ {6}/gm, '            ')}
          },
        },
      },
    },
  } as const;

  constructor(
    @inject(${n.pascal}Service) private readonly service: ${n.pascal}Service,
  ) {}

  @OasTag('${tag}')

  @OasSummary('List ${n.plural} (JWT)')
  @OasResponse(
    HttpStatusCode.OK,
    OpenApiConstants.json('${tag} found', {
      type: 'array',
      items: ${n.pascal}V1Resource.SCHEMA,
    }),
  )
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.problem('Missing or invalid JWT'),
  )
  @OasSecurity({bearerAuth: []})
  @UseGuard(JwtGuard)
  @Get()
  async list(): Promise<ApiResponse<${n.pascal}V1Dto[]>> {
    const all = await this.service.findAll();
    return ApiResponse.ok('${tag} found', ${n.pascal}Converter.toDtoList(all));
  }

  @OasTag('${tag}')

  @OasSummary('Get a ${n.kebab} by id (JWT)')
  @OasParameter(OpenApiConstants.ID_PATH_PARAM)
  @OasResponse(
    HttpStatusCode.OK,
    OpenApiConstants.json('${n.pascal} found', ${n.pascal}V1Resource.SCHEMA),
  )
  @OasResponse(
    HttpStatusCode.NOT_FOUND,
    OpenApiConstants.problem('${n.pascal} not found'),
  )
  @OasSecurity({bearerAuth: []})
  @UseGuard(JwtGuard)
  @Get('/:id')
  async get(
    @Params({name: 'id'}) id: string,
  ): Promise<ApiResponse<${n.pascal}V1Dto>> {
    const entity = await this.service.findById(id);
    return ApiResponse.ok('${n.pascal} found', ${n.pascal}Converter.toDto(entity));
  }

  @OasTag('${tag}')

  @OasSummary('Create a ${n.kebab} (JWT, ${n.plural}:write)')
  @OasRequestBody(${n.pascal}V1Resource.BODY)
  @OasResponse(
    HttpStatusCode.CREATED,
    OpenApiConstants.json('${n.pascal} created', ${n.pascal}V1Resource.SCHEMA),
  )
  @OasResponse(
    HttpStatusCode.BAD_REQUEST,
    OpenApiConstants.problem('Validation failed'),
  )
  @OasSecurity({bearerAuth: []})
  @UseGuard(JwtGuard, Scopes.require(ScopeConstants.${n.constant}_WRITE))
  @Post()
  async create(@Body() body: unknown): Promise<CreatedHttpResponse> {
    const entity = await this.service.create(Create${n.pascal}Dto.from(body));
    return new CreatedHttpResponse(
      ApiResponse.ok('${n.pascal} created', ${n.pascal}Converter.toDto(entity)),
    );
  }

  @OasTag('${tag}')

  @OasSummary('Replace a ${n.kebab} (JWT, ${n.plural}:write)')
  @OasParameter(OpenApiConstants.ID_PATH_PARAM)
  @OasRequestBody(${n.pascal}V1Resource.BODY)
  @OasResponse(
    HttpStatusCode.OK,
    OpenApiConstants.json('${n.pascal} replaced', ${n.pascal}V1Resource.SCHEMA),
  )
  @OasResponse(
    HttpStatusCode.NOT_FOUND,
    OpenApiConstants.problem('${n.pascal} not found'),
  )
  @OasSecurity({bearerAuth: []})
  @UseGuard(JwtGuard, Scopes.require(ScopeConstants.${n.constant}_WRITE))
  @Put('/:id')
  async replace(
    @Params({name: 'id'}) id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<${n.pascal}V1Dto>> {
    const entity = await this.service.replace(id, Create${n.pascal}Dto.from(body));
    return ApiResponse.ok('${n.pascal} replaced', ${n.pascal}Converter.toDto(entity));
  }

  @OasTag('${tag}')

  @OasSummary('Delete a ${n.kebab} (JWT, ${n.plural}:write)')
  @OasParameter(OpenApiConstants.ID_PATH_PARAM)
  @OasResponse(HttpStatusCode.NO_CONTENT, OpenApiConstants.NO_CONTENT)
  @OasResponse(
    HttpStatusCode.NOT_FOUND,
    OpenApiConstants.problem('${n.pascal} not found'),
  )
  @OasSecurity({bearerAuth: []})
  @UseGuard(JwtGuard, Scopes.require(ScopeConstants.${n.constant}_WRITE))
  @Delete('/:id')
  async delete(
    @Params({name: 'id'}) id: string,
  ): Promise<NoContentHttpResponse> {
    await this.service.delete(id);
    return new NoContentHttpResponse();
  }
}
`;
  }

  private sample(field: Field, variant: number): string {
    switch (field.type) {
      case 'string':
      case 'text':
        return `'${field.name} ${variant}'`;
      case 'int':
        return String(variant);
      case 'boolean':
        return variant % 2 === 0 ? 'true' : 'false';
    }
  }

  /** Integration test for the routes, as the caller the auth method allows. */
  test(spec: AuthSpec, publicReads: boolean): string {
    const {n, scope} = this;
    const write = `ScopeConstants.${n.constant}_WRITE`;
    const body = (v: number) =>
      `{${this.fields.map((f) => `${f.name}: ${this.sample(f, v)}`).join(', ')}}`;
    const first = this.fields[0]!;
    const anonymous =
      spec.kind === 'jwt' || spec.kind === 'hmac' ? '[401]' : '[401, 501]';
    const head = `import {ScopeConstants} from '${scope}/common/constant/scope.constants.js';
${AuthTemplates.canCall(spec) ? AuthTemplates.testSetup(spec, scope, write).imports : ''}
import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {TestApp} from '../support/test-app.js';
`;
    const reads = publicReads
      ? `  it('lets anyone read', async () => {
    expect((await request(app).get(path)).status).toBe(200);
  });
`
      : `  it('refuses an anonymous read', async () => {
    expect(${anonymous}).toContain((await request(app).get(path)).status);
  });
`;
    if (!AuthTemplates.canCall(spec)) {
      return `${head}
/**
 * ${spec.label}: anonymous callers are refused here. Calling as an allowed
 * client needs a real ${spec.label} client; see the e2e tests for one.
 */
describe('${n.pluralPascal} (generated)', () => {
  const path = '/api/v1/${n.plural}';
  let application: Application;
  let app: express.Application;

  beforeAll(async () => {
    ({application, app} = await TestApp.create());
  });
  afterAll(() => application.close());

${reads}
  it('refuses anonymous writes', async () => {
    void ${write};
    const id = '00000000-0000-0000-0000-000000000000';
    for (const response of [
      await request(app).post(path).send(${body(1)}),
      await request(app).put(\`\${path}/\${id}\`).send(${body(1)}),
      await request(app).delete(\`\${path}/\${id}\`),
    ]) {
      expect(${anonymous}).toContain(response.status);
    }
  });
});
`;
    }
    const setup = AuthTemplates.testSetup(spec, scope, write);
    return `${head}
describe('${n.pluralPascal} (generated)', () => {
  const path = '/api/v1/${n.plural}';
  let application: Application;
  let app: express.Application;
${setup.helper}

  beforeAll(async () => {
    ({application, app} = await TestApp.create(${setup.env}));
${
  spec.kind === 'jwt'
    ? `    token = await application.beans
      .getBean(TokenProvider)
      .createToken('writer', {scope: ${write}});
`
    : ''
}  });
  afterAll(() => application.close());

  /** A request as the allowed client; the body is sent exactly as signed. */
  const call = (
    method: 'get' | 'post' | 'put' | 'delete',
    url: string,
    body?: object,
  ) => {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const req = request(app)[method](url).set(signed(method.toUpperCase(), url, raw));
    return body === undefined ? req : req.send(raw);
  };

${reads}
  it('refuses an anonymous write', async () => {
    expect((await request(app).post(path).send(${body(1)})).status).toBe(401);
  });

  it('creates, reads, replaces and deletes', async () => {
    const created = await call('post', path, ${body(1)});
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect(created.body.data.${first.name}).toEqual(${this.sample(first, 1)});

    expect((await call('get', \`\${path}/\${id}\`)).status).toBe(200);

    const replaced = await call('put', \`\${path}/\${id}\`, ${body(2)});
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.${first.name}).toEqual(${this.sample(first, 2)});

    expect((await call('get', path)).body.data).toHaveLength(1);
    expect((await call('delete', \`\${path}/\${id}\`)).status).toBe(204);

    const gone = await call('get', \`\${path}/\${id}\`);
    expect(gone.status).toBe(404);
    expect(gone.headers['content-type']).toMatch(/problem\\+json/);
  });

  it('rejects invalid input with every failing field', async () => {
    const response = await call('post', path, {});
    expect(response.status).toBe(400);
    expect(Object.keys(response.body.data).sort()).toEqual(
      ${JSON.stringify(this.fields.map((f) => f.name).sort()).replace(/"/g, "'")},
    );
  });
});
`;
  }
}
