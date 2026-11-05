import {inject} from 'inversify';
import {AppConfig} from '../../config/app.config.js';
import {CacheStore} from '../../config/cache/cache-store.js';
import {Component} from '../../config/stereotypes.js';
import {AppLogger} from '../../util/app-logger.js';

/**
 * Deny-list of token ids (jti) for JWTs and SSO sessions, so logout and
 * revocation take effect before the token expires. An entry lives only until
 * the token would expire anyway, so the list stays small.
 *
 * Fails open with a warning: if the store cannot answer, the token is
 * accepted. Tokens are short-lived (1 h by default), so a cache outage lets a
 * revoked token live at most until it expires, instead of taking every
 * authenticated route down. Use CACHE_TYPE=redis so every instance shares it.
 */
@Component()
export class TokenRevocation {
  constructor(
    @inject(CacheStore) private readonly store: CacheStore,
    @inject(AppConfig) private readonly config: AppConfig,
    @inject(AppLogger) private readonly appLogger: AppLogger,
  ) {}

  async revoke(jti: string, expiresAt: number): Promise<void> {
    const ttl = Math.max(1, Math.ceil(expiresAt - Date.now() / 1000));
    await this.store.set(this.key(jti), '1', ttl);
  }

  async isRevoked(jti: string): Promise<boolean> {
    try {
      return (await this.store.get(this.key(jti))) !== null;
    } catch (error) {
      this.appLogger.logger.warn(
        {err: error},
        'Revocation list unavailable; accepting token',
      );
      return false;
    }
  }

  private key(jti: string): string {
    return `${this.config.env.CACHE_PREFIX}revoked:${jti}`;
  }
}
