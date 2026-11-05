export class CacheConstants {
  static readonly USERS_ALL = 'users:all';
  static readonly HMAC_NONCE_PREFIX = 'hmac:';

  static user(id: string): string {
    return `users:${id}`;
  }
}
