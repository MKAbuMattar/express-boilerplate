import type {CookieOptions, Request, Response} from 'express';
import {inject} from 'inversify';
import {jwtVerify, SignJWT} from 'jose';
import {AppConfig} from '../../config/app.config.js';
import {Component} from '../../config/stereotypes.js';
import {SecurityConstants} from '../../constant/security.constants.js';
import type {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';
import {Principal} from '../principal.js';

/** Stateless SSO session: a signed JWT in an httpOnly cookie. */
@Component()
export class SessionService {
  private readonly key: Uint8Array;

  constructor(@inject(AppConfig) private readonly config: AppConfig) {
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
    if (typeof token !== 'string') return null;
    try {
      const {payload} = await jwtVerify(token, this.key, {
        algorithms: [SecurityConstants.JWT_ALGORITHM],
      });
      return new Principal(
        payload.strategy as AuthStrategy,
        payload.sub ?? '',
        (payload.claims as Record<string, unknown>) ?? {},
      );
    } catch {
      return null;
    }
  }

  end(response: Response): void {
    response.clearCookie(SecurityConstants.SESSION_COOKIE, this.cookieOptions);
  }
}
