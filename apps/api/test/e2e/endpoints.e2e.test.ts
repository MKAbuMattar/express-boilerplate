import {type ChildProcess, spawn} from 'node:child_process';
import {createHmac, randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import tls from 'node:tls';
import {SignJWT} from 'jose';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {WebSocket} from 'ws';
import {HttpsClient} from '../support/https-client.js';
import {MockIdentityProvider} from '../support/mock-identity-provider.js';
import {TestApp} from '../support/test-app.js';

/**
 * Black-box: boots the real server process (src/main.ts) over HTTPS with
 * every auth strategy configured against a mock IdP, then calls it like a
 * client would.
 */
describe('E2E: real HTTPS server', () => {
  const JWT_SECRET = randomBytes(32).toString('base64url');
  const HMAC_SECRET = 'e2e-hmac-secret';
  let certs: string;
  let idp: MockIdentityProvider;
  let server: ChildProcess;
  let client: HttpsClient;
  let output = '';

  beforeAll(async () => {
    certs = TestApp.certs();
    idp = await new MockIdentityProvider(certs).start();
    const port = await HttpsClient.freePort();
    client = new HttpsClient(certs, port);
    server = spawn(
      process.execPath,
      ['--disable-proto=delete', '--import', 'tsx', 'src/main.ts'],
      {
        env: {
          ...process.env,
          NODE_ENV: 'development',
          NODE_EXTRA_CA_CERTS: join(certs, 'ca.crt'),
          HOST: '127.0.0.1',
          PORT: String(port),
          PUBLIC_URL: `https://localhost:${port}`,
          TLS_KEY_FILE: join(certs, 'server.key'),
          TLS_CERT_FILE: join(certs, 'server.crt'),
          TLS_CA_FILE: join(certs, 'ca.crt'),
          DB_TYPE: 'sqljs',
          DB_URL: '',
          CACHE_TYPE: 'memory',
          JWT_SECRET,
          HMAC_CLIENTS: `e2e-partner:${HMAC_SECRET}`,
          OAUTH2_ISSUER: idp.issuer,
          OAUTH2_AUDIENCE: MockIdentityProvider.API_AUDIENCE,
          OAUTH2_JWKS_URI: idp.jwksUri,
          OIDC_ISSUER: idp.issuer,
          OIDC_CLIENT_ID: MockIdentityProvider.CLIENT_ID,
          OIDC_CLIENT_SECRET: 'e2e-secret',
          SAML_ENTRY_POINT: `${idp.issuer}/saml`,
          SAML_ISSUER: 'express-boilerplate-e2e',
          SAML_IDP_CERT: readFileSync(join(certs, 'ca.crt'), 'utf8'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    server.stdout?.on('data', (chunk) => (output += chunk));
    server.stderr?.on('data', (chunk) => (output += chunk));
    for (let i = 0; i < 100; i++) {
      const ready = await client
        .request('GET', '/api/health')
        .catch(() => null);
      if (ready?.status === 200) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`server did not start:\n${output}`);
  });

  afterAll(async () => {
    server?.kill();
    await idp?.stop();
  });

  const jwt = () =>
    new SignJWT({scope: 'users:write ops:queues ops:network'})
      .setProtectedHeader({alg: 'HS256'})
      .setSubject('e2e-admin')
      .setJti(randomBytes(8).toString('hex'))
      .setIssuedAt()
      .setIssuer('express-boilerplate')
      .setAudience('express-boilerplate')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(JWT_SECRET));

  it('serves health, docs (development) and JSON 404s', async () => {
    expect((await client.request('GET', '/api/health')).json.data).toEqual({
      database: 'sqljs',
      cache: 'memory',
    });
    expect((await client.request('GET', '/docs')).status).toBe(200);
    expect((await client.request('GET', '/nope')).status).toBe(404);
  });

  it('runs the users lifecycle', async () => {
    const auth = {authorization: `Bearer ${await jwt()}`};
    const body = {name: 'Alice', email: 'alice@example.com', age: 42};
    expect((await client.request('POST', '/api/users', {body})).status).toBe(
      401,
    );
    const created = await client.request('POST', '/api/users', {
      headers: auth,
      body,
    });
    expect(created.status).toBe(201);
    const id = created.json.data.id;
    expect(
      (await client.request('POST', '/api/users', {headers: auth, body}))
        .status,
    ).toBe(409);
    expect((await client.request('GET', '/api/users')).json.data).toHaveLength(
      1,
    );
    expect((await client.request('GET', `/api/users/${id}`)).status).toBe(200);
    expect(
      (await client.request('DELETE', `/api/users/${id}`, {headers: auth}))
        .status,
    ).toBe(204);
    expect((await client.request('GET', `/api/users/${id}`)).status).toBe(404);
  });

  it('mTLS: 200 with the client cert, 401 without', async () => {
    const withCert = await client.request('GET', '/api/secure/mtls', {
      clientCert: true,
    });
    expect(withCert.status).toBe(200);
    expect(withCert.json.data.subject).toBe('local-client');
    expect((await client.request('GET', '/api/secure/mtls')).status).toBe(401);
  });

  it('HMAC: signed once is 200, the replay is 401', async () => {
    const body = '{"amount":10}';
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = {
      'x-client-id': 'e2e-partner',
      'x-timestamp': ts,
      'x-signature': createHmac('sha256', HMAC_SECRET)
        .update(`${ts}\nPOST\n/api/secure/hmac\n${body}`)
        .digest('hex'),
    };
    expect(
      (await client.request('POST', '/api/secure/hmac', {headers, body}))
        .status,
    ).toBe(200);
    expect(
      (await client.request('POST', '/api/secure/hmac', {headers, body}))
        .status,
    ).toBe(401);
  });

  it('OAuth2: token from the IdP is 200, wrong audience is 401', async () => {
    const ok = await client.request('GET', '/api/secure/oauth2', {
      headers: {authorization: `Bearer ${await idp.accessToken('client-42')}`},
    });
    expect(ok.json.data.subject).toBe('client-42');
    const wrong = await client.request('GET', '/api/secure/oauth2', {
      headers: {authorization: `Bearer ${await idp.accessToken('c', 'other')}`},
    });
    expect(wrong.status).toBe(401);
  });

  it('OIDC: full login, session, logout', async () => {
    const login = await client.request('GET', '/auth/oidc/login');
    expect(login.status).toBe(302);
    const state = login.cookie('oidc_state')!;
    const authorize = await client.request('GET', '', {
      url: new URL(String(login.headers.location)),
    });
    const callback = new URL(String(authorize.headers.location));
    const done = await client.request(
      'GET',
      callback.pathname + callback.search,
      {
        headers: {cookie: state},
      },
    );
    expect(done.status).toBe(302);
    const session = done.cookie('session')!;
    const me = await client.request('GET', '/auth/me', {
      headers: {cookie: session},
    });
    expect(me.json.data).toMatchObject({
      strategy: 'oidc',
      subject: 'oidc-user',
    });
    expect(
      (
        await client.request('GET', '/api/secure/sso', {
          headers: {cookie: session},
        })
      ).status,
    ).toBe(200);
    const forged = await client.request(
      'GET',
      '/auth/oidc/callback?code=x&state=forged',
      {
        headers: {cookie: state},
      },
    );
    expect(forged.status).toBe(401);
    expect(
      (
        await client.request('POST', '/auth/logout', {
          headers: {cookie: session},
        })
      ).status,
    ).toBe(204);
  });

  it('SAML: redirect, metadata, forged assertion is 401', async () => {
    const login = await client.request('GET', '/auth/saml/login');
    expect(String(login.headers.location)).toContain('/saml?SAMLRequest=');
    expect((await client.request('GET', '/auth/saml/metadata')).text).toContain(
      'AssertionConsumerService',
    );
    const forged = Buffer.from(
      '<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"/>',
    ).toString('base64');
    const acs = await client.request('POST', '/auth/saml/acs', {
      headers: {'content-type': 'application/x-www-form-urlencoded'},
      body: `SAMLResponse=${encodeURIComponent(forged)}`,
    });
    expect(acs.status).toBe(401);
    expect(acs.cookie('session')).toBeUndefined();
  });

  it('WebSocket over TLS (wss://) with a JWT', async () => {
    const token = await jwt();
    const reply = await new Promise<any>((resolve, reject) => {
      const ws = new WebSocket(`wss://localhost:${client.port}/ws`, {
        ca: readFileSync(join(certs, 'ca.crt')),
        headers: {authorization: `Bearer ${token}`},
      });
      ws.on('message', (data) => {
        const message = JSON.parse(String(data));
        if (message.type === 'whoami') {
          ws.close();
          resolve(message);
        }
      });
      ws.once('open', () => ws.send(JSON.stringify({type: 'whoami'})));
      ws.once('error', reject);
    });
    expect(reply).toEqual({
      type: 'whoami',
      strategy: 'jwt',
      subject: 'e2e-admin',
    });
  });

  it('API v2: PUT create, PATCH, QUERY, ETag 304, problem details', async () => {
    const auth = {authorization: `Bearer ${await jwt()}`};
    const id = '11111111-2222-4333-8444-555555555555';
    const put = await client.request('PUT', `/api/v2/users/${id}`, {
      headers: auth,
      body: {name: 'Eve', email: 'eve@example.com', age: 28},
    });
    expect(put.status).toBe(201);
    expect(put.headers.location).toBe(`/api/v2/users/${id}`);
    const patched = await client.request('PATCH', `/api/v2/users/${id}`, {
      headers: {...auth, 'content-type': 'application/merge-patch+json'},
      body: {phone: '+1 555 0199'},
    });
    expect(patched.json.data.phone).toBe('+1 555 0199');
    const found = await client.request('QUERY', '/api/v2/users/search', {
      body: {search: 'eve'},
    });
    expect(found.json.data.total).toBe(1);
    const etag = String(
      (await client.request('GET', `/api/v2/users/${id}`)).headers.etag,
    );
    expect(
      (
        await client.request('GET', `/api/v2/users/${id}`, {
          headers: {'if-none-match': etag},
        })
      ).status,
    ).toBe(304);
    const problem = await client.request('DELETE', `/api/v2/users/${id}`);
    expect(problem.status).toBe(401);
    expect(String(problem.headers['content-type'])).toMatch(/problem\+json/);
  });

  it('TLS: strong ECDHE suites only, nothing below TLS 1.2', async () => {
    const handshake = (options: tls.ConnectionOptions) =>
      new Promise<string>((resolve) => {
        const socket = tls.connect(
          {
            host: 'localhost',
            port: client.port,
            ca: readFileSync(join(certs, 'ca.crt')),
            ...options,
          },
          () => {
            const cipher = socket.getCipher().name;
            socket.end();
            resolve(cipher);
          },
        );
        socket.on('error', (error) => resolve(`rejected: ${error.message}`));
      });
    expect(
      await handshake({
        maxVersion: 'TLSv1.2',
        ciphers: 'ECDHE-RSA-AES128-GCM-SHA256',
      }),
    ).toBe('ECDHE-RSA-AES128-GCM-SHA256');
    // Static RSA key exchange: no forward secrecy, so the server refuses it.
    expect(
      await handshake({maxVersion: 'TLSv1.2', ciphers: 'AES128-GCM-SHA256'}),
    ).toMatch(/^rejected/);
    expect(
      await handshake({
        minVersion: 'TLSv1',
        maxVersion: 'TLSv1.1',
        ciphers: 'DEFAULT@SECLEVEL=0',
      }),
    ).toMatch(/^rejected/);
  });

  it('A/B: a visitor keeps the variant', async () => {
    const first = await client.request('GET', '/api/experiments/new-checkout');
    const cookie = first.cookie('ab_id')!;
    const again = await client.request('GET', '/api/experiments/new-checkout', {
      headers: {cookie},
    });
    expect(again.json.data.variant).toBe(first.json.data.variant);
  });
});
