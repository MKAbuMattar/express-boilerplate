import {randomUUID} from 'node:crypto';
import {inject} from 'inversify';
import {type JWTPayload, jwtVerify, SignJWT} from 'jose';
import {AppConfig} from '../../config/app.config.js';
import {Component} from '../../config/stereotypes.js';
import {SecurityConstants} from '../../constant/security.constants.js';
import {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';
import {AuthException} from '../../exceptions/auth.exception.js';
import {Principal} from '../principal.js';
import {JwtKeys} from './jwt-keys.js';
import {TokenRevocation} from './token-revocation.js';

/**
 * Issues and validates this service's own JWTs.
 * Every token has sub, jti, iat and exp; validation requires all four, the
 * expected issuer, audience and algorithm (no alg confusion), allows 30 s of
 * clock skew, and refuses revoked ids.
 */
@Component()
export class TokenProvider {
  private static readonly REQUIRED = ['sub', 'jti', 'iat', 'exp'];

  constructor(
    @inject(AppConfig) private readonly config: AppConfig,
    @inject(JwtKeys) private readonly keys: JwtKeys,
    @inject(TokenRevocation) private readonly revocation: TokenRevocation,
  ) {}

  async createToken(
    subject: string,
    claims: JWTPayload = {},
    expiresIn: string = SecurityConstants.JWT_DEFAULT_TTL,
  ): Promise<string> {
    const {key, kid} = await this.keys.signing();
    return new SignJWT(claims)
      .setProtectedHeader({alg: this.keys.algorithm, ...(kid && {kid})})
      .setSubject(subject)
      .setJti(randomUUID())
      .setIssuer(this.config.env.JWT_ISSUER)
      .setAudience(this.config.env.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(key);
  }

  async validateToken(token: string): Promise<JWTPayload> {
    const verifier = await this.keys.verifier();
    const options = {
      algorithms: [this.keys.algorithm],
      issuer: this.config.env.JWT_ISSUER,
      audience: this.config.env.JWT_AUDIENCE,
      requiredClaims: TokenProvider.REQUIRED,
      clockTolerance: this.config.env.JWT_CLOCK_TOLERANCE_SECONDS,
    };
    const {payload} =
      verifier instanceof Uint8Array
        ? await jwtVerify(token, verifier, options)
        : await jwtVerify(token, verifier, options);
    if (await this.revocation.isRevoked(String(payload.jti))) {
      throw AuthException.unauthorized(AuthStrategy.Jwt, 'token revoked');
    }
    return payload;
  }

  /** Revokes a validated token until it would have expired anyway. */
  async revoke(payload: JWTPayload): Promise<void> {
    await this.revocation.revoke(String(payload.jti), Number(payload.exp));
  }

  /** The caller behind a valid token; throws like validateToken. */
  async authenticate(token: string): Promise<Principal> {
    const payload = await this.validateToken(token);
    return new Principal(AuthStrategy.Jwt, payload.sub ?? '', payload);
  }
}
