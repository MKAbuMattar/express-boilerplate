import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthStrategy} from '@express-boilerplate/common/enumeration/auth-strategy.enum.js';
import {TokenProvider} from '@express-boilerplate/common/security/jwt/token.provider.js';
import {Principal} from '@express-boilerplate/common/security/principal.js';
import {SessionService} from '@express-boilerplate/common/security/sso/session.service.js';
import type express from 'express';
import {exportPKCS8, exportSPKI, generateKeyPair, SignJWT} from 'jose';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {TestApp} from '../support/test-app.js';

describe('Security: authentication', () => {
  describe('revocation', () => {
    let application: Application;
    let app: express.Application;
    beforeAll(async () => {
      ({application, app} = await TestApp.create());
    });
    afterAll(() => application.close());

    it('a revoked JWT stops working at once; other tokens do not', async () => {
      const tokens = application.beans.getBean(TokenProvider);
      const token = await tokens.createToken('alice');
      const other = await tokens.createToken('alice');
      const use = (t: string) =>
        request(app).get('/api/v1/secure/jwt').auth(t, {type: 'bearer'});
      expect((await use(token)).status).toBe(200);
      expect(
        (
          await request(app)
            .post('/auth/token/revoke')
            .auth(token, {type: 'bearer'})
        ).status,
      ).toBe(204);
      const after = await use(token);
      expect(after.status).toBe(401);
      expect(after.body.detail).toMatch(/revoked/);
      expect((await use(other)).status).toBe(200);
    });

    it('SSO logout revokes the session server-side', async () => {
      let cookie = '';
      await application.beans
        .getBean(SessionService)
        .start(
          {cookie: (n: string, v: string) => (cookie = `${n}=${v}`)} as never,
          new Principal(AuthStrategy.Saml, 'bob'),
        );
      expect(
        (await request(app).get('/auth/me').set('cookie', cookie)).status,
      ).toBe(200);
      expect(
        (await request(app).post('/auth/logout').set('cookie', cookie)).status,
      ).toBe(204);
      // A copy of the cookie taken before logout no longer works.
      expect(
        (await request(app).get('/auth/me').set('cookie', cookie)).status,
      ).toBe(401);
    });
  });

  describe('token validation', () => {
    let application: Application;
    let app: express.Application;
    const secret = new TextEncoder().encode(TestApp.JWT_SECRET);
    const base = () =>
      new SignJWT({})
        .setProtectedHeader({alg: 'HS256'})
        .setSubject('x')
        .setIssuer('express-boilerplate')
        .setAudience('express-boilerplate')
        .setIssuedAt()
        .setExpirationTime('5m');
    beforeAll(async () => {
      ({application, app} = await TestApp.create());
    });
    afterAll(() => application.close());
    const status = async (token: string) =>
      (
        await request(app)
          .get('/api/v1/secure/jwt')
          .auth(token, {type: 'bearer'})
      ).status;

    it('requires a jti', async () => {
      expect(await status(await base().sign(secret))).toBe(401);
      expect(await status(await base().setJti('j1').sign(secret))).toBe(200);
    });

    it('refuses alg "none" and a wrong issuer', async () => {
      const header = Buffer.from(
        JSON.stringify({alg: 'none', typ: 'JWT'}),
      ).toString('base64url');
      const body = Buffer.from(
        JSON.stringify({
          sub: 'x',
          jti: 'j',
          iss: 'express-boilerplate',
          aud: 'express-boilerplate',
          iat: 1,
          exp: 9999999999,
        }),
      ).toString('base64url');
      expect(await status(`${header}.${body}.`)).toBe(401);
      expect(
        await status(await base().setJti('j2').setIssuer('evil').sign(secret)),
      ).toBe(401);
    });
  });

  describe('ES256 keys, JWKS and rotation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jwt-keys-'));
    const keyPair = async (name: string) => {
      const {privateKey, publicKey} = await generateKeyPair('ES256', {
        extractable: true,
      });
      writeFileSync(join(dir, `${name}.key`), await exportPKCS8(privateKey));
      writeFileSync(join(dir, `${name}.pub`), await exportSPKI(publicKey));
      return {key: join(dir, `${name}.key`), pub: join(dir, `${name}.pub`)};
    };
    const boot = (env: Record<string, string>) =>
      TestApp.create({JWT_ALGORITHM: 'ES256', JWT_SECRET: '', ...env});
    const call = (app: express.Application, token: string) =>
      request(app).get('/api/v1/secure/jwt').auth(token, {type: 'bearer'});

    it('signs with the private key, publishes only public keys, rotates cleanly', async () => {
      const a = await keyPair('a');
      const b = await keyPair('b');

      const first = await boot({JWT_PRIVATE_KEY_FILE: a.key});
      const oldToken = await first.application.beans
        .getBean(TokenProvider)
        .createToken('u');
      const jwksA = (await request(first.app).get('/.well-known/jwks.json'))
        .body.keys;
      expect(jwksA).toHaveLength(1);
      expect(jwksA[0]).toMatchObject({
        kty: 'EC',
        crv: 'P-256',
        alg: 'ES256',
        use: 'sig',
      });
      expect(jwksA[0]).not.toHaveProperty('d'); // never the private part
      expect((await call(first.app, oldToken)).status).toBe(200);
      await first.application.close();

      // Rotate: B signs, A still verifies.
      const second = await boot({
        JWT_PRIVATE_KEY_FILE: b.key,
        JWT_PUBLIC_KEY_FILES: a.pub,
      });
      const newToken = await second.application.beans
        .getBean(TokenProvider)
        .createToken('u');
      const header = JSON.parse(
        Buffer.from(newToken.split('.')[0]!, 'base64url').toString(),
      );
      const jwksAB = (await request(second.app).get('/.well-known/jwks.json'))
        .body.keys;
      expect(jwksAB.map((k: {kid: string}) => k.kid)).toEqual([
        header.kid,
        jwksA[0].kid,
      ]);
      expect((await call(second.app, oldToken)).status).toBe(200);
      expect((await call(second.app, newToken)).status).toBe(200);
      await second.application.close();

      // Old key retired: its tokens stop working.
      const third = await boot({JWT_PRIVATE_KEY_FILE: b.key});
      expect((await call(third.app, oldToken)).status).toBe(401);
      expect((await call(third.app, newToken)).status).toBe(200);
      await third.application.close();
    });

    it('refuses an HS256 token when the service uses ES256 (no alg confusion)', async () => {
      const a = await keyPair('c');
      const {application, app} = await boot({JWT_PRIVATE_KEY_FILE: a.key});
      const forged = await new SignJWT({})
        .setProtectedHeader({alg: 'HS256'})
        .setSubject('x')
        .setJti('j')
        .setIssuer('express-boilerplate')
        .setAudience('express-boilerplate')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode(TestApp.JWT_SECRET));
      expect((await call(app, forged)).status).toBe(401);
      await application.close();
    });

    it('HS256 publishes no keys', async () => {
      const {application, app} = await TestApp.create();
      expect((await request(app).get('/.well-known/jwks.json')).body).toEqual({
        keys: [],
      });
      await application.close();
    });
  });
});
