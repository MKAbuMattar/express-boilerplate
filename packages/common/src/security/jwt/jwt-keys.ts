import {readFileSync} from 'node:fs';
import {inject} from 'inversify';
import {
  calculateJwkThumbprint,
  createLocalJWKSet,
  exportJWK,
  importPKCS8,
  importSPKI,
  type JWK,
  type JWTVerifyGetKey,
} from 'jose';
import {AppConfig} from '../../config/app.config.js';
import {Component} from '../../config/stereotypes.js';
import {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';
import {AuthException} from '../../exceptions/auth.exception.js';

class SigningKey {
  constructor(
    readonly key: CryptoKey | Uint8Array,
    readonly kid: string | undefined,
  ) {}
}

/**
 * The keys behind this service's JWTs.
 *
 * HS256 (default): one shared JWT_SECRET signs and verifies. Simple, but any
 * service that verifies can also mint tokens.
 *
 * ES256: JWT_PRIVATE_KEY_FILE signs; only public keys verify, published at
 * /.well-known/jwks.json, so other services verify without a secret. Each
 * key's kid is its RFC 7638 thumbprint.
 *
 * Rotation (ES256): make a new key (pnpm jwt:keygen), point
 * JWT_PRIVATE_KEY_FILE at it and list the old public key in
 * JWT_PUBLIC_KEY_FILES. New tokens use the new key; tokens signed by the old
 * one keep verifying until they expire. Then drop the old file.
 */
@Component()
export class JwtKeys {
  private loaded?: Promise<{
    signing: SigningKey;
    verify: Uint8Array | JWTVerifyGetKey;
    jwks: JWK[];
  }>;

  constructor(@inject(AppConfig) private readonly config: AppConfig) {}

  get algorithm(): 'HS256' | 'ES256' {
    return this.config.env.JWT_ALGORITHM as 'HS256' | 'ES256';
  }

  async signing(): Promise<SigningKey> {
    return (await this.load()).signing;
  }

  async verifier(): Promise<Uint8Array | JWTVerifyGetKey> {
    return (await this.load()).verify;
  }

  /** Public keys only (empty for HS256: a shared secret is never published). */
  async jwks(): Promise<{keys: JWK[]}> {
    if (this.algorithm === 'HS256') return {keys: []};
    return {keys: (await this.load()).jwks};
  }

  private load() {
    this.loaded ??=
      this.algorithm === 'HS256' ? this.loadSecret() : this.loadKeyPair();
    // A failed load (missing file, bad PEM) is retried on the next call.
    this.loaded.catch(() => {
      this.loaded = undefined;
    });
    return this.loaded;
  }

  private async loadSecret() {
    const secret = this.config.env.JWT_SECRET;
    if (!secret) throw AuthException.notConfigured(AuthStrategy.Jwt);
    const key = new TextEncoder().encode(secret);
    return {signing: new SigningKey(key, undefined), verify: key, jwks: []};
  }

  private async loadKeyPair() {
    const {JWT_PRIVATE_KEY_FILE, JWT_PUBLIC_KEY_FILES} = this.config.env;
    if (!JWT_PRIVATE_KEY_FILE)
      throw AuthException.notConfigured(AuthStrategy.Jwt);

    const privateKey = await importPKCS8(
      readFileSync(JWT_PRIVATE_KEY_FILE, 'utf8'),
      'ES256',
      {extractable: true},
    );
    const {d: _secret, ...current} = await exportJWK(privateKey);
    const jwks = [await JwtKeys.publish(current)];
    for (const file of JWT_PUBLIC_KEY_FILES.split(',')
      .map((f) => f.trim())
      .filter(Boolean)) {
      const previous = await importSPKI(readFileSync(file, 'utf8'), 'ES256', {
        extractable: true,
      });
      jwks.push(await JwtKeys.publish(await exportJWK(previous)));
    }
    return {
      signing: new SigningKey(privateKey, jwks[0]!.kid),
      verify: createLocalJWKSet({keys: jwks}),
      jwks,
    };
  }

  private static async publish(jwk: JWK): Promise<JWK> {
    return {
      ...jwk,
      kid: await calculateJwkThumbprint(jwk),
      alg: 'ES256',
      use: 'sig',
    };
  }
}
