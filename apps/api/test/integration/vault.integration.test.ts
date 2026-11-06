import {createServer, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {VaultSecrets} from '@express-boilerplate/common/config/vault-secrets.js';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

describe('Vault secrets', () => {
  let vault: Server;
  let address: string;
  const calls: {method: string; url: string; token?: string; body: string}[] =
    [];

  beforeAll(async () => {
    vault = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        calls.push({
          method: req.method!,
          url: req.url!,
          token: req.headers['x-vault-token'] as string,
          body,
        });
        res.setHeader('content-type', 'application/json');
        if (req.url === '/v1/auth/approle/login') {
          const {role_id, secret_id} = JSON.parse(body);
          if (role_id === 'role' && secret_id === 'secret') {
            return res.end(
              JSON.stringify({auth: {client_token: 'approle-token'}}),
            );
          }
          res.statusCode = 400;
          return res.end(
            JSON.stringify({errors: ['invalid secret id: secret']}),
          );
        }
        if (req.url === '/v1/secret/data/express-boilerplate') {
          if (
            !['root', 'approle-token'].includes(
              String(req.headers['x-vault-token']),
            )
          ) {
            res.statusCode = 403;
            return res.end('{"errors":["permission denied"]}');
          }
          return res.end(
            JSON.stringify({
              data: {
                data: {
                  JWT_SECRET: 'from-vault-0123456789abcdef0123456',
                  HMAC_CLIENTS: 'a:b',
                  lower_case: 'x',
                  NUMBER: 5,
                },
              },
            }),
          );
        }
        res.statusCode = 404;
        return res.end('{}');
      });
    });
    await new Promise<void>((r) => vault.listen(0, '127.0.0.1', r));
    address = `http://127.0.0.1:${(vault.address() as AddressInfo).port}`;
  });
  afterAll(() => vault.close());

  it('does nothing without VAULT_ADDR', async () => {
    expect(await VaultSecrets.load({})).toEqual([]);
  });

  it('loads UPPER_CASE string keys with a token, overriding .env values', async () => {
    const env: NodeJS.ProcessEnv = {
      VAULT_ADDR: address,
      VAULT_TOKEN: 'root',
      JWT_SECRET: 'from-dotenv',
    };
    expect(await VaultSecrets.load(env)).toEqual([
      'JWT_SECRET',
      'HMAC_CLIENTS',
    ]);
    expect(env.JWT_SECRET).toBe('from-vault-0123456789abcdef0123456');
    expect(env).not.toHaveProperty('lower_case');
    expect(env).not.toHaveProperty('NUMBER');
  });

  it('logs in with AppRole', async () => {
    const env: NodeJS.ProcessEnv = {
      VAULT_ADDR: `${address}/`,
      VAULT_ROLE_ID: 'role',
      VAULT_SECRET_ID: 'secret',
    };
    await VaultSecrets.load(env);
    expect(calls.at(-1)?.token).toBe('approle-token');
  });

  it('fails fast, without echoing Vault error bodies', async () => {
    await expect(
      VaultSecrets.load({VAULT_ADDR: address, VAULT_TOKEN: 'wrong'}),
    ).rejects.toThrow('Vault /v1/secret/data/express-boilerplate answered 403');
    const bad = VaultSecrets.load({
      VAULT_ADDR: address,
      VAULT_ROLE_ID: 'role',
      VAULT_SECRET_ID: 'nope',
    });
    await expect(bad).rejects.toThrow('answered 400');
    await expect(bad).rejects.not.toThrow(/secret id/);
    await expect(VaultSecrets.load({VAULT_ADDR: address})).rejects.toThrow(
      /VAULT_TOKEN/,
    );
  });
});
