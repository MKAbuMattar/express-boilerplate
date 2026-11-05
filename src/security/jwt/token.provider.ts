import {inject} from 'inversify';
import {type JWTPayload, jwtVerify, SignJWT} from 'jose';
import {AppConfig} from '../../config/app.config.js';
import {Component} from '../../config/stereotypes.js';
import {SecurityConstants} from '../../constant/security.constants.js';
import {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';
import {AuthException} from '../../exceptions/auth.exception.js';

/** Issues and validates this service's own JWTs (HS256, JWT_SECRET). */
@Component()
export class TokenProvider {
  constructor(@inject(AppConfig) private readonly config: AppConfig) {}

  async createToken(
    subject: string,
    claims: JWTPayload = {},
    expiresIn: string = SecurityConstants.JWT_DEFAULT_TTL,
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({alg: SecurityConstants.JWT_ALGORITHM})
      .setSubject(subject)
      .setIssuer(this.config.env.JWT_ISSUER)
      .setAudience(this.config.env.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(this.key());
  }

  async validateToken(token: string): Promise<JWTPayload> {
    const {payload} = await jwtVerify(token, this.key(), {
      algorithms: [SecurityConstants.JWT_ALGORITHM],
      issuer: this.config.env.JWT_ISSUER,
      audience: this.config.env.JWT_AUDIENCE,
    });
    return payload;
  }

  private key(): Uint8Array {
    if (!this.config.env.JWT_SECRET) {
      throw AuthException.notConfigured(AuthStrategy.Jwt);
    }
    return new TextEncoder().encode(this.config.env.JWT_SECRET);
  }
}
