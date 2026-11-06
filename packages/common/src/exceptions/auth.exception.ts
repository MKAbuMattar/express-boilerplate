import {
  NotImplementedHttpResponse,
  UnauthorizedHttpResponse,
} from '@inversifyjs/http-core';
import type {Request} from 'express';
import type {AuthStrategy} from '../enumeration/auth-strategy.enum.js';
import {ApiResponse} from '../rest/dto/api-response.dto.js';

export class AuthException {
  static unauthorized(strategy: AuthStrategy, reason: string) {
    return new UnauthorizedHttpResponse(
      ApiResponse.fail(`Unauthorized (${strategy}): ${reason}`),
    );
  }

  static notConfigured(strategy: AuthStrategy) {
    return new NotImplementedHttpResponse(
      ApiResponse.fail(`Auth strategy "${strategy}" is not configured`),
    );
  }

  static bearerToken(request: Request, strategy: AuthStrategy): string {
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw AuthException.unauthorized(strategy, 'missing bearer token');
    }
    return token;
  }
}
