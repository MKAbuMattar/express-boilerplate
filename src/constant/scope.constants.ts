/** OAuth-style scopes (permissions) that routes require. */
export class ScopeConstants {
  static readonly USERS_WRITE = 'users:write';
  static readonly OPS_QUEUES = 'ops:queues';
  static readonly OPS_NETWORK = 'ops:network';

  static readonly ALL: readonly string[] = [
    ScopeConstants.USERS_WRITE,
    ScopeConstants.OPS_QUEUES,
    ScopeConstants.OPS_NETWORK,
  ];
}
