/** OAuth-style scopes (permissions) that routes require. */
export class ScopeConstants {
  static readonly USERS_WRITE = 'users:write';
  static readonly OPS_QUEUES = 'ops:queues';
  // @feature:network
  static readonly OPS_NETWORK = 'ops:network';
  // @end:network

  static readonly ALL: readonly string[] = [
    ScopeConstants.USERS_WRITE,
    ScopeConstants.OPS_QUEUES,
    // @feature:network
    ScopeConstants.OPS_NETWORK,
    // @end:network
  ];
}
