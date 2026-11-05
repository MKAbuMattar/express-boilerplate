import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {OpenApiConfig} from '../../src/config/openapi.config.js';
import {TestApp} from '../support/test-app.js';

type Operation = {
  tags?: string[];
  summary?: string;
  responses?: Record<
    string,
    {content?: Record<string, {schema?: {$ref?: string}}>}
  >;
};

/** The served OpenAPI document stays complete as routes are added. */
describe('OpenAPI document (Swagger, development)', () => {
  let application: Application;
  let app: express.Application;
  let spec: {
    info: {title: string; description: string};
    tags: {name: string}[];
    paths: Record<string, Record<string, Operation>>;
    components: {
      schemas: Record<string, unknown>;
      securitySchemes: Record<string, {type: string}>;
    };
  };
  const operations: [string, Operation][] = [];

  beforeAll(async () => {
    ({application, app} = await TestApp.create({NODE_ENV: 'development'}));
    const init = (await request(app).get('/docs/resources/swagger-ui-init.js'))
      .text;
    const json = init.slice(
      init.indexOf('{', init.indexOf('let options')),
      init.indexOf(';\n', init.indexOf('let options')),
    );
    spec = JSON.parse(json).openApiObject;
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        operations.push([`${method.toUpperCase()} ${path}`, operation]);
      }
    }
  });
  afterAll(() => application.close());

  it('has an overview, tags in order and every auth scheme', () => {
    expect(spec.info.title).toBe('Express Boilerplate API');
    expect(spec.info.description).toMatch(/RFC 9457/);
    expect(spec.tags.map((t) => t.name)).toEqual(
      OpenApiConfig.TAGS.map((t) => t.name),
    );
    expect(Object.keys(spec.components.securitySchemes).sort()).toEqual(
      ['bearerAuth', 'hmac', 'mutualTLS', 'oauth2', 'session'].sort(),
    );
    expect(spec.components.securitySchemes.mutualTLS!.type).toBe('mutualTLS');
  });

  it('every operation is tagged with a declared tag (nothing under "default")', () => {
    const declared = new Set(spec.tags.map((t) => t.name));
    const untagged = operations
      .filter(
        ([, op]) => !op.tags?.length || !op.tags.every((t) => declared.has(t)),
      )
      .map(([name]) => name);
    expect(operations.length).toBeGreaterThan(35);
    expect(untagged).toEqual([]);
  });

  it('every operation has a summary and documented responses', () => {
    const missing = operations
      .filter(
        ([, op]) =>
          !op.summary ||
          !op.responses ||
          Object.keys(op.responses).length === 0,
      )
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('every 4xx/5xx is problem details', () => {
    const wrong: string[] = [];
    for (const [name, op] of operations) {
      for (const [code, response] of Object.entries(op.responses ?? {})) {
        if (Number(code) < 400) continue;
        const ref =
          response.content?.['application/problem+json']?.schema?.$ref;
        // Actuator DOWN (503) is the Actuator body by design.
        const actuator =
          response.content?.['application/json']?.schema?.$ref ===
          '#/components/schemas/ActuatorHealth';
        if (ref !== '#/components/schemas/Problem' && !actuator)
          wrong.push(`${name} ${code}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('every $ref points at a defined schema', () => {
    const refs = [
      ...JSON.stringify(spec).matchAll(
        /"\$ref":"#\/components\/schemas\/([^"]+)"/g,
      ),
    ].map((m) => m[1]!);
    const undefinedRefs = [...new Set(refs)].filter(
      (name) => !(name in spec.components.schemas),
    );
    expect(refs.length).toBeGreaterThan(20);
    expect(undefinedRefs).toEqual([]);
  });

  it('does not list the QUERY route under methods that answer 405', () => {
    expect(spec.paths['/api/v2/users/search']).toBeUndefined();
    expect(JSON.stringify(spec.tags)).toContain('QUERY /api/v2/users/search');
  });

  it('types the main payloads', () => {
    const data = (path: string, method: string, code: string) =>
      JSON.stringify(spec.paths[path]?.[method]?.responses?.[code]);
    expect(data('/api/v2/users', 'get', '200')).toContain(
      '#/components/schemas/UserPage',
    );
    expect(data('/api/v2/users/{id}', 'patch', '200')).toContain(
      '#/components/schemas/UserV2',
    );
    expect(data('/api/v1/users', 'get', '200')).toContain(
      '#/components/schemas/UserV1',
    );
    expect(data('/actuator/health', 'get', '503')).toContain(
      '#/components/schemas/ActuatorHealth',
    );
  });
});
