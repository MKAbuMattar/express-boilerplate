import {isHttpResponse} from '@inversifyjs/http-core';
import {describe, expect, it} from 'vitest';
import {JwtGuard} from '../../src/security/jwt/jwt.guard.js';
import {TokenProvider} from '../../src/security/jwt/token.provider.js';
import {UnitFixtures} from '../support/unit-fixtures.js';

describe('TokenProvider + JwtGuard', () => {
  const SECRET = 'unit-jwt-secret-0123456789abcdef0123';
  const provider = (env: Record<string, string> = {}) =>
    new TokenProvider(UnitFixtures.config({JWT_SECRET: SECRET, ...env}));
  const statusOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return 200;
    } catch (error) {
      return isHttpResponse(error) ? error.statusCode : -1;
    }
  };
  const bearer = (token: string) =>
    UnitFixtures.request({headers: {authorization: `Bearer ${token}`}});

  it('round-trips subject and claims', async () => {
    const tokens = provider();
    const token = await tokens.createToken('alice', {role: 'admin'});
    expect(await tokens.validateToken(token)).toMatchObject({
      sub: 'alice',
      role: 'admin',
    });
  });

  it('rejects a token from another issuer or audience', async () => {
    const token = await provider({JWT_ISSUER: 'someone-else'}).createToken('a');
    await expect(provider().validateToken(token)).rejects.toThrow();
    const other = await provider({JWT_AUDIENCE: 'other'}).createToken('a');
    await expect(provider().validateToken(other)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await provider().createToken('a', {}, '-1s');
    await expect(provider().validateToken(token)).rejects.toThrow();
  });

  it('guard: 200 valid, 401 missing, 401 wrong scheme, 501 unconfigured', async () => {
    const tokens = provider();
    const guard = new JwtGuard(tokens);
    expect(
      await statusOf(guard.activate(bearer(await tokens.createToken('a')))),
    ).toBe(200);
    expect(await statusOf(guard.activate(UnitFixtures.request({})))).toBe(401);
    expect(
      await statusOf(
        guard.activate(
          UnitFixtures.request({headers: {authorization: 'Basic abc'}}),
        ),
      ),
    ).toBe(401);
    const unconfigured = new JwtGuard(new TokenProvider(UnitFixtures.config()));
    expect(await statusOf(unconfigured.activate(bearer('x.y.z')))).toBe(501);
  });
});
