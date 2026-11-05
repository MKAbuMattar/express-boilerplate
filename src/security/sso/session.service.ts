import {randomUUID} from 'node:crypto';
import type {CookieOptions, Request, Response} from 'express';
import {inject} from 'inversify';
import {jwtVerify, SignJWT} from 'jose';
import {AppConfig} from '../../config/app.config.js';
import {Component} from '../../config/stereotypes.js';
import {SecurityConstants} from '../../constant/security.constants.js';
import type {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';
import {TokenRevocation} from '../jwt/token-revocation.js';
import {Principal} from '../principal.js';

/** Stateless SSO session: a signed JWT in an httpOnly cookie. */
@Component()
export class SessionService {
  private readonly key: Uint8Array;

  constructor(
    @inject(AppConfig) private readonly config: AppConfig,
    @inject(TokenRevocation) private readonly revocation: TokenRevocation,
  ) {
    this.key = new TextEncoder().encode(config.env.SESSION_SECRET);
  }

  get cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.env.NODE_ENV !== 'test',
      sameSite: 'lax',
      path: '/',
    };
  }

  async start(response: Response, principal: Principal): Promise<void> {
    const ttl = SecurityConstants.SESSION_TTL_SECONDS;
    const token = await new SignJWT({
      strategy: principal.strategy,
      claims: principal.claims,
    })
      .setProtectedHeader({alg: SecurityConstants.JWT_ALGORITHM})
      .setSubject(principal.subject)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(this.key);
    response.cookie(SecurityConstants.SESSION_COOKIE, token, {
      ...this.cookieOptions,
      maxAge: ttl * 1000,
    });
  }

  async read(request: Request): Promise<Principal | null> {
    const token: unknown = request.cookies?.[SecurityConstants.SESSION_COOKIE];
    return typeof token === 'string' ? this.readToken(token) : null;
  }

  /** For callers without an Express request, such as the WebSocket upgrade. */
  async readToken(token: string): Promise<Principal | null> {
    try {
      const {payload} = await jwtVerify(token, this.key, {
        algorithms: [SecurityConstants.JWT_ALGORITHM],
        requiredClaims: ['sub', 'jti', 'exp'],
      });
      if (await this.revocation.isRevoked(String(payload.jti))) return null;
      return new Principal(
        payload.strategy as AuthStrategy,
        payload.sub ?? '',
        (payload.claims as Record<string, unknown>) ?? {},
      );
    } catch {
      return null;
    }
  }

  /**
   * Logout: revokes this session server-side, so a copied cookie stops
   * working at once, not when it expires.
   */
  async end(request: Request, response: Response): Promise<void> {
    const token: unknown = request.cookies?.[SecurityConstants.SESSION_COOKIE];
    if (typeof token === 'string') {
      try {
        const {payload} = await jwtVerify(token, this.key, {
          algorithms: [SecurityConstants.JWT_ALGORITHM],
        });
        if (payload.jti && payload.exp) {
          await this.revocation.revoke(payload.jti, payload.exp);
        }
      } catch {
        // An invalid or expired cookie has nothing left to revoke.
      }
    }
    response.clearCookie(SecurityConstants.SESSION_COOKIE, this.cookieOptions);
  }
}
