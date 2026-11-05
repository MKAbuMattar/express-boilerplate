import {readFileSync} from 'node:fs';
import {createServer, type Server} from 'node:http';
import https from 'node:https';
import type {AddressInfo} from 'node:net';
import {join} from 'node:path';
import type express from 'express';
import {exportJWK, generateKeyPair, SignJWT} from 'jose';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {TlsConfig} from '../../src/config/tls.config.js';
import {AuthStrategy} from '../../src/enumeration/auth-strategy.enum.js';
import {HmacGuard} from '../../src/security/hmac/hmac.guard.js';
import {TokenProvider} from '../../src/security/jwt/token.provider.js';
import {Principal} from '../../src/security/principal.js';
import {SessionService} from '../../src/security/sso/session.service.js';
import {TestApp} from '../support/test-app.js';

describe('auth strategies', () => {
  let application: Application;
  let app: express.Application;
  let jwksServer: Server;
  let oauthKey: CryptoKey;
  let jwksUri: string;
  let certs: string;

  beforeAll(async () => {
    certs = TestApp.certs();
    const keys = await generateKeyPair('RS256');
    oauthKey = keys.privateKey;
    const jwk = {...(await exportJWK(keys.publicKey)), kid: 'k1', alg: 'RS256'};
    jwksServer = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({keys: [jwk]}));
    });
    await new Promise<void>((resolve) => jwksServer.listen(0, resolve));
    jwksUri = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}/jwks`;

    ({application, app} = await TestApp.create({
      OAUTH2_ISSUER: 'https://idp.example.com',
      OAUTH2_AUDIENCE: 'api',
      OAUTH2_JWKS_URI: jwksUri,
      SAML_ENTRY_POINT: 'https://idp.example.com/saml',
      SAML_ISSUER: 'express-boilerplate',
      SAML_IDP_CERT: readFileSync(join(certs, 'ca.crt'), 'utf8'),
    }));
  });
  afterAll(async () => {
    jwksServer.close();
    await application.close();
  });

  it('public needs nothing', async () => {
    expect((await request(app).get('/api/secure/public')).status).toBe(200);
  });

  describe('hmac', () => {
    const body = JSON.stringify({amount: 10});
    const signed = (secret: string, timestamp: number) =>
      HmacGuard.sign(
        secret,
        String(timestamp),
        'POST',
        '/api/secure/hmac',
        body,
      );

    it('accepts a valid signature', async () => {
      const ts = Math.floor(Date.now() / 1000);
      const response = await request(app)
        .post('/api/secure/hmac')
        .set('content-type', 'application/json')
        .set('x-client-id', 'partner-a')
        .set('x-timestamp', String(ts))
        .set('x-signature', signed(TestApp.HMAC_SECRET, ts))
        .send(body);
      expect(response.status).toBe(200);
      expect(response.body.data.subject).toBe('partner-a');
    });

    it('rejects a replayed signature', async () => {
      const ts = Math.floor(Date.now() / 1000) - 1;
      const send = () =>
        request(app)
          .post('/api/secure/hmac')
          .set('content-type', 'application/json')
          .set('x-client-id', 'partner-a')
          .set('x-timestamp', String(ts))
          .set('x-signature', signed(TestApp.HMAC_SECRET, ts))
          .send(body);
      expect((await send()).status).toBe(200);
      const replay = await send();
      expect(replay.status).toBe(401);
      expect(replay.body.message).toContain('already used');
    });

    it('rejects a wrong secret and a stale timestamp', async () => {
      const ts = Math.floor(Date.now() / 1000);
      const wrong = await request(app)
        .post('/api/secure/hmac')
        .set('content-type', 'application/json')
        .set('x-client-id', 'partner-a')
        .set('x-timestamp', String(ts))
        .set('x-signature', signed('wrong', ts))
        .send(body);
      expect(wrong.status).toBe(401);

      const stale = ts - 600;
      const old = await request(app)
        .post('/api/secure/hmac')
        .set('content-type', 'application/json')
        .set('x-client-id', 'partner-a')
        .set('x-timestamp', String(stale))
        .set('x-signature', signed(TestApp.HMAC_SECRET, stale))
        .send(body);
      expect(old.status).toBe(401);
    });
  });

  describe('jwt', () => {
    it('accepts a token from TokenProvider', async () => {
      const token = await application.beans
        .getBean(TokenProvider)
        .createToken('alice');
      const response = await request(app)
        .get('/api/secure/jwt')
        .auth(token, {type: 'bearer'});
      expect(response.status).toBe(200);
      expect(response.body.data.subject).toBe('alice');
    });

    it('rejects a tampered token', async () => {
      const token = await application.beans
        .getBean(TokenProvider)
        .createToken('alice');
      const response = await request(app)
        .get('/api/secure/jwt')
        .auth(`${token}x`, {type: 'bearer'});
      expect(response.status).toBe(401);
    });
  });

  describe('oauth2', () => {
    const accessToken = (audience: string) =>
      new SignJWT({scope: 'read'})
        .setProtectedHeader({alg: 'RS256', kid: 'k1'})
        .setIssuer('https://idp.example.com')
        .setAudience(audience)
        .setSubject('client-123')
        .setExpirationTime('5m')
        .sign(oauthKey);

    it('accepts a token signed by the JWKS key', async () => {
      const response = await request(app)
        .get('/api/secure/oauth2')
        .auth(await accessToken('api'), {type: 'bearer'});
      expect(response.status).toBe(200);
      expect(response.body.data.subject).toBe('client-123');
    });

    it('rejects the wrong audience', async () => {
      const response = await request(app)
        .get('/api/secure/oauth2')
        .auth(await accessToken('other'), {type: 'bearer'});
      expect(response.status).toBe(401);
    });
  });

  describe('sso (oidc / saml session)', () => {
    it('accepts a session cookie and rejects none', async () => {
      let cookie = '';
      const fakeResponse = {
        cookie: (name: string, value: string) => {
          cookie = `${name}=${value}`;
        },
      } as unknown as express.Response;
      await application.beans
        .getBean(SessionService)
        .start(
          fakeResponse,
          new Principal(AuthStrategy.Saml, 'bob@example.com'),
        );

      const ok = await request(app).get('/auth/me').set('cookie', cookie);
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({
        strategy: 'saml',
        subject: 'bob@example.com',
      });

      expect((await request(app).get('/api/secure/sso')).status).toBe(401);
    });

    it('redirects SAML login to the IdP with a SAMLRequest', async () => {
      const response = await request(app).get('/auth/saml/login');
      expect(response.status).toBe(302);
      expect(response.headers.location).toMatch(
        /^https:\/\/idp\.example\.com\/saml\?SAMLRequest=/,
      );
    });

    it('serves SAML SP metadata', async () => {
      const response = await request(app).get('/auth/saml/metadata');
      expect(response.status).toBe(200);
      expect(response.text).toContain('AssertionConsumerService');
    });

    it('returns 501 for OIDC when it is not configured', async () => {
      expect((await request(app).get('/auth/oidc/login')).status).toBe(501);
    });
  });

  describe('mtls over a real TLS socket', () => {
    let server: https.Server;
    let port: number;

    beforeAll(async () => {
      const config = application.config;
      const tls = TlsConfig.serverOptions(
        Object.assign(Object.create(Object.getPrototypeOf(config)), config, {
          env: {
            ...config.env,
            TLS_KEY_FILE: join(certs, 'server.key'),
            TLS_CERT_FILE: join(certs, 'server.crt'),
            TLS_CA_FILE: join(certs, 'ca.crt'),
          },
        }),
      );
      server = https.createServer(tls, app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      port = (server.address() as AddressInfo).port;
    });
    afterAll(
      () => new Promise<void>((resolve) => server.close(() => resolve())),
    );

    const get = (withClientCert: boolean) =>
      new Promise<{status: number; body: any}>((resolve, reject) => {
        https
          .get(
            {
              host: 'localhost',
              port,
              path: '/api/secure/mtls',
              ca: readFileSync(join(certs, 'ca.crt')),
              ...(withClientCert && {
                key: readFileSync(join(certs, 'client.key')),
                cert: readFileSync(join(certs, 'client.crt')),
              }),
              agent: false,
            },
            (res) => {
              let data = '';
              res.on('data', (chunk) => {
                data += chunk;
              });
              res.on('end', () =>
                resolve({status: res.statusCode ?? 0, body: JSON.parse(data)}),
              );
            },
          )
          .on('error', reject);
      });

    it('accepts a client cert signed by the CA', async () => {
      const response = await get(true);
      expect(response.status).toBe(200);
      expect(response.body.data.subject).toBe('local-client');
    });

    it('rejects a request without a client cert', async () => {
      expect((await get(false)).status).toBe(401);
    });
  });
});
