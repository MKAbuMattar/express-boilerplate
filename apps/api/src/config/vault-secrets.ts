/**
 * Loads secrets from HashiCorp Vault (KV v2) into the environment before
 * AppConfig reads it, so secrets live in Vault, not in .env files or images.
 *
 * Off unless VAULT_ADDR is set. Auth: VAULT_TOKEN, or AppRole with
 * VAULT_ROLE_ID + VAULT_SECRET_ID (the production choice: short-lived
 * tokens, no long-lived root token on disk). Reads
 * <VAULT_KV_MOUNT>/data/<VAULT_SECRET_PATH>; every UPPER_CASE string key
 * becomes an environment variable, overriding values from .env.
 *
 * Fails fast: if Vault is set up but unreachable, startup stops rather than
 * running with missing or default secrets.
 */
export class VaultSecrets {
  private static readonly KEY = /^[A-Z][A-Z0-9_]*$/;
  private static readonly TIMEOUT_MS = 5000;

  /** Returns the names it loaded (never the values). */
  static async load(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
    const address = env.VAULT_ADDR;
    if (!address) return [];
    const base = address.replace(/\/+$/, '');
    const token =
      env.VAULT_TOKEN || (await VaultSecrets.appRoleLogin(base, env));
    const mount = env.VAULT_KV_MOUNT || 'secret';
    const path = env.VAULT_SECRET_PATH || 'express-boilerplate';

    const body = await VaultSecrets.call(`${base}/v1/${mount}/data/${path}`, {
      headers: {'X-Vault-Token': token},
    });
    const data =
      (body as {data?: {data?: Record<string, unknown>}}).data?.data ?? {};
    const loaded: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (VaultSecrets.KEY.test(key) && typeof value === 'string') {
        env[key] = value;
        loaded.push(key);
      }
    }
    return loaded;
  }

  private static async appRoleLogin(
    base: string,
    env: NodeJS.ProcessEnv,
  ): Promise<string> {
    const {VAULT_ROLE_ID: roleId, VAULT_SECRET_ID: secretId} = env;
    if (!roleId || !secretId) {
      throw new Error(
        'VAULT_ADDR is set: also set VAULT_TOKEN, or VAULT_ROLE_ID and VAULT_SECRET_ID',
      );
    }
    const body = await VaultSecrets.call(`${base}/v1/auth/approle/login`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({role_id: roleId, secret_id: secretId}),
    });
    const token = (body as {auth?: {client_token?: string}}).auth?.client_token;
    if (!token) throw new Error('Vault AppRole login returned no token');
    return token;
  }

  private static async call(url: string, init: RequestInit): Promise<unknown> {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(VaultSecrets.TIMEOUT_MS),
    });
    if (!response.ok) {
      // Never echo the body: Vault errors can include request details.
      throw new Error(
        `Vault ${new URL(url).pathname} answered ${response.status}`,
      );
    }
    return response.json();
  }
}
