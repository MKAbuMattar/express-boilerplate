import {createHmac, timingSafeEqual} from 'node:crypto';
import {ServiceUnavailableHttpResponse} from '@inversifyjs/http-core';
import type {ExpressGuard} from '@inversifyjs/http-express';
import type {Request} from 'express';
import {inject} from 'inversify';
import {AppConfig} from '../../config/app.config.js';
import {Component} from '../../config/stereotypes.js';
import {CacheConstants} from '../../constant/cache.constants.js';
import {SecurityConstants} from '../../constant/security.constants.js';
import {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';
import {AuthException} from '../../exceptions/auth.exception.js';
import {ApiResponse} from '../../rest/dto/api-response.dto.js';
import {CacheService} from '../../service/cache.service.js';
import {Principal} from '../principal.js';

/**
 * Headers: X-Client-Id, X-Timestamp (unix seconds), X-Signature (hex).
 * Signature: HMAC-SHA256(secret, `${timestamp}\n${METHOD}\n${originalUrl}\n${rawBody}`).
 * Each signature is accepted once: CacheService remembers it for the window,
 * so a replay gets 401. Use CACHE_TYPE=redis when running more than one instance.
 */
@Component()
export class HmacGuard implements ExpressGuard {
  constructor(
    @inject(AppConfig) private readonly config: AppConfig,
    @inject(CacheService) private readonly cache: CacheService,
  ) {}

  static sign(
    secret: string,
    timestamp: string,
    method: string,
    url: string,
    body: Buffer | string = '',
  ): string {
    return createHmac('sha256', secret)
      .update(`${timestamp}\n${method.toUpperCase()}\n${url}\n`)
      .update(body)
      .digest('hex');
  }

  async activate(request: Request): Promise<boolean> {
    if (this.config.hmacClients.size === 0) {
      throw AuthException.notConfigured(AuthStrategy.Hmac);
    }
    const clientId =
      request.header(SecurityConstants.HMAC_CLIENT_ID_HEADER) ?? '';
    const timestamp =
      request.header(SecurityConstants.HMAC_TIMESTAMP_HEADER) ?? '';
    const signature =
      request.header(SecurityConstants.HMAC_SIGNATURE_HEADER) ?? '';
    const secret = this.config.hmacClients.get(clientId);
    if (!secret || !timestamp || !signature) {
      throw AuthException.unauthorized(
        AuthStrategy.Hmac,
        'missing or unknown credentials',
      );
    }
    const skew = Math.abs(Date.now() - Number(timestamp) * 1000);
    if (!(skew <= SecurityConstants.HMAC_MAX_CLOCK_SKEW_MS)) {
      throw AuthException.unauthorized(
        AuthStrategy.Hmac,
        'timestamp outside allowed window',
      );
    }

    const expected = Buffer.from(
      HmacGuard.sign(
        secret,
        timestamp,
        request.method,
        request.originalUrl,
        request.rawBody,
      ),
    );
    const received = Buffer.from(signature);
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw AuthException.unauthorized(AuthStrategy.Hmac, 'signature mismatch');
    }

    // A timestamp is valid for skew on either side, so remember it for both.
    const windowSeconds = (SecurityConstants.HMAC_MAX_CLOCK_SKEW_MS * 2) / 1000;
    const nonceKey = `${CacheConstants.HMAC_NONCE_PREFIX}${signature}`;
    let firstUse: boolean;
    try {
      firstUse = await this.cache.setIfAbsent(nonceKey, windowSeconds);
    } catch {
      // Fail closed: without the replay check a captured request could repeat.
      throw new ServiceUnavailableHttpResponse(
        ApiResponse.fail('Replay protection unavailable, retry later'),
      );
    }
    if (!firstUse) {
      throw AuthException.unauthorized(
        AuthStrategy.Hmac,
        'signature already used',
      );
    }

    request.principal = new Principal(AuthStrategy.Hmac, clientId, {
      scope: this.config.hmacClientScopes.get(clientId) ?? '',
    });
    return true;
  }
}
