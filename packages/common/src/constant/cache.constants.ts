export class CacheConstants {
  static readonly USERS_ALL = 'users:all';
  // @feature:auth-hmac
  static readonly HMAC_NONCE_PREFIX = 'hmac:';
  // @end:auth-hmac

  static user(id: string): string {
    return `users:${id}`;
  }
}
