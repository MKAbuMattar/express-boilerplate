import {ForbiddenHttpResponse} from '@inversifyjs/http-core';
import type {ExpressGuard} from '@inversifyjs/http-express';
import type {Request} from 'express';
import {injectable, type Newable} from 'inversify';
import {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';
import {AuthException} from '../../exceptions/auth.exception.js';
import {ApiResponse} from '../../rest/dto/api-response.dto.js';
import type {Principal} from '../principal.js';

/**
 * Authorization by scope. Authentication says who the caller is; this says
 * what they may do. Put it after an auth guard:
 *
 *   @UseGuard(JwtGuard, Scopes.require(ScopeConstants.USERS_WRITE))
 *
 * The caller needs every listed scope, else 403 with
 * `WWW-Authenticate: Bearer error="insufficient_scope"` (RFC 6750).
 *
 * Scopes are read from the token claims IdPs use for permissions:
 * `scope` (OAuth 2.0, space-separated), `scp` (Entra ID), `roles`,
 * `permissions` (Auth0).
 */
export class Scopes {
  private static readonly CLAIMS = ['scope', 'scp', 'roles', 'permissions'];
  private static readonly guards = new Map<string, Newable<ExpressGuard>>();

  /** One guard class per scope set, created once and reused. */
  static require(...required: string[]): Newable<ExpressGuard> {
    const key = [...required].sort().join(' ');
    const existing = Scopes.guards.get(key);
    if (existing) return existing;

    class ScopeGuard implements ExpressGuard {
      activate(request: Request): boolean {
        if (!request.principal) {
          throw AuthException.unauthorized(
            AuthStrategy.Jwt,
            'authenticate first',
          );
        }
        const granted = Scopes.of(request.principal);
        const missing = required.filter((scope) => !granted.has(scope));
        if (missing.length > 0) {
          throw new ForbiddenHttpResponse(
            ApiResponse.fail('Insufficient scope', {required, missing}),
            undefined,
            undefined,
            {
              'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${required.join(' ')}"`,
            },
          );
        }
        return true;
      }
    }
    Object.defineProperty(ScopeGuard, 'name', {value: `ScopeGuard(${key})`});
    injectable()(ScopeGuard);
    Scopes.guards.set(key, ScopeGuard);
    return ScopeGuard;
  }

  /** Every scope the principal holds, from any of the known claims. */
  static of(principal: Principal): Set<string> {
    const scopes = new Set<string>();
    for (const claim of Scopes.CLAIMS) {
      const value = principal.claims[claim];
      const list = Array.isArray(value)
        ? value
        : typeof value === 'string'
          ? value.split(' ')
          : [];
      for (const scope of list) {
        if (typeof scope === 'string' && scope) scopes.add(scope);
      }
    }
    return scopes;
  }
}
