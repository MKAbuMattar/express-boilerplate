import {isHttpResponse} from '@inversifyjs/http-core';
import type {ExpressGuard} from '@inversifyjs/http-express';
import type {Request} from 'express';
import {inject} from 'inversify';
import {Component} from '../../config/stereotypes.js';
import {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';
import {AuthException} from '../../exceptions/auth.exception.js';
import {Principal} from '../principal.js';
import {TokenProvider} from './token.provider.js';

/** Bearer JWT issued by TokenProvider. */
@Component()
export class JwtGuard implements ExpressGuard {
  constructor(
    @inject(TokenProvider) private readonly tokenProvider: TokenProvider,
  ) {}

  async activate(request: Request): Promise<boolean> {
    const token = AuthException.bearerToken(request, AuthStrategy.Jwt);
    try {
      const payload = await this.tokenProvider.validateToken(token);
      request.principal = new Principal(
        AuthStrategy.Jwt,
        payload.sub ?? '',
        payload,
      );
      return true;
    } catch (error) {
      if (isHttpResponse(error)) throw error; // e.g. 501 not configured
      throw AuthException.unauthorized(
        AuthStrategy.Jwt,
        'invalid or expired token',
      );
    }
  }
}
