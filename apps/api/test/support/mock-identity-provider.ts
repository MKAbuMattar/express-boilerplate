import {readFileSync} from 'node:fs';
import https from 'node:https';
import type {AddressInfo} from 'node:net';
import {join} from 'node:path';
import {exportJWK, generateKeyPair, type JWK, SignJWT} from 'jose';

/**
 * Minimal OIDC provider and OAuth 2.0 authorization server over HTTPS:
 * discovery, JWKS, an authorize endpoint that approves at once, and a token
 * endpoint that issues an RS256 id_token. For tests only.
 */
export class MockIdentityProvider {
  static readonly CLIENT_ID = 'test-client';
  static readonly API_AUDIENCE = 'test-api';

  private server?: https.Server;
  private privateKey?: CryptoKey;
  /** Nonce from the last authorize call, echoed into the id_token. */
  private nonce = '';
  private jwk?: JWK;
  issuer = '';

  constructor(private readonly certDir: string) {}

  async start(): Promise<this> {
    const keys = await generateKeyPair('RS256');
    this.privateKey = keys.privateKey;
    this.jwk = {...(await exportJWK(keys.publicKey)), kid: 'k1', alg: 'RS256'};
    this.server = https.createServer(
      {
        key: readFileSync(join(this.certDir, 'server.key')),
        cert: readFileSync(join(this.certDir, 'server.crt')),
      },
      (request, response) => {
        this.handle(request.url ?? '/', response).catch(() => {
          response.writeHead(500).end();
        });
      },
    );
    await new Promise<void>((resolve) => this.server!.listen(0, resolve));
    const {port} = this.server.address() as AddressInfo;
    this.issuer = `https://localhost:${port}`;
    return this;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  get jwksUri(): string {
    return `${this.issuer}/jwks`;
  }

  /** An access token as an external authorization server would issue it. */
  accessToken(
    subject: string,
    audience: string = MockIdentityProvider.API_AUDIENCE,
  ): Promise<string> {
    return this.sign({scope: 'read'}, audience, subject);
  }

  private sign(
    claims: Record<string, unknown>,
    audience: string,
    subject: string,
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({alg: 'RS256', kid: 'k1'})
      .setIssuer(this.issuer)
      .setAudience(audience)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(this.privateKey!);
  }

  private async handle(
    path: string,
    response: import('node:http').ServerResponse,
  ): Promise<void> {
    const url = new URL(path, this.issuer);
    const json = (body: unknown) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(body));
    };
    switch (url.pathname) {
      case '/.well-known/openid-configuration':
        return json({
          issuer: this.issuer,
          authorization_endpoint: `${this.issuer}/authorize`,
          token_endpoint: `${this.issuer}/token`,
          jwks_uri: this.jwksUri,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256'],
        });
      case '/jwks':
        return json({keys: [this.jwk]});
      case '/authorize': {
        const back = new URL(url.searchParams.get('redirect_uri') ?? '');
        this.nonce = url.searchParams.get('nonce') ?? '';
        back.searchParams.set('code', 'test-code');
        back.searchParams.set('state', url.searchParams.get('state') ?? '');
        response.writeHead(302, {location: back.href}).end();
        return;
      }
      case '/token':
        return json({
          access_token: 'opaque',
          token_type: 'Bearer',
          expires_in: 300,
          id_token: await this.sign(
            {email: 'oidc@example.com', name: 'OIDC User', nonce: this.nonce},
            MockIdentityProvider.CLIENT_ID,
            'oidc-user',
          ),
        });
      default:
        response.writeHead(404).end();
    }
  }
}
