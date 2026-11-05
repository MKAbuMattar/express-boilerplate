import type {ExpressGuard} from '@inversifyjs/http-express';
import type {Request} from 'express';
import {inject} from 'inversify';
import {Component} from '../../config/stereotypes.js';
import {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';
import {AuthException} from '../../exceptions/auth.exception.js';
import {SessionService} from './session.service.js';

/** Browser session created by an OIDC or SAML login. */
@Component()
export class SsoGuard implements ExpressGuard {
  constructor(
    @inject(SessionService) private readonly sessionService: SessionService,
  ) {}

  async activate(request: Request): Promise<boolean> {
    const principal = await this.sessionService.read(request);
    if (!principal) {
      throw AuthException.unauthorized(
        AuthStrategy.Oidc,
        'login via /auth/oidc/login or /auth/saml/login',
      );
    }
    request.principal = principal;
    return true;
  }
}
