import {afterEach, describe, expect, it, vi} from 'vitest';
import {AppConfig} from '../../src/config/app.config.js';
import {DatabaseConfig} from '../../src/config/database.config.js';

describe('AppConfig', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // envalid reports problems by calling process.exit; turn that into a throw.
  const failsWith = (env: NodeJS.ProcessEnv) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    return () => new AppConfig(env);
  };

  it('splits CORS origins, HMAC clients and experiments', () => {
    const config = new AppConfig({
      NODE_ENV: 'test',
      CORS_ORIGINS: 'https://a.example, https://b.example',
      HMAC_CLIENTS: 'a:s1,b:s:with:colons',
      EXPERIMENTS: 'checkout:50, search:10',
    });
    expect(config.corsOrigins).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(config.hmacClients.get('b')).toBe('s:with:colons');
    expect([...config.experiments]).toEqual([
      ['checkout', 50],
      ['search', 10],
    ]);
  });

  it('uses dev defaults only when NODE_ENV is set and not production', () => {
    expect(new AppConfig({NODE_ENV: 'development'}).env.SESSION_SECRET).toMatch(
      /^dev-only/,
    );
    expect(failsWith({})).toThrow('exit 1');
    expect(failsWith({NODE_ENV: 'production'})).toThrow('exit 1');
  });

  it('rejects short secrets', () => {
    expect(failsWith({NODE_ENV: 'test', JWT_SECRET: 'short'})).toThrow(
      'exit 1',
    );
    expect(
      failsWith({NODE_ENV: 'production', SESSION_SECRET: 'short'}),
    ).toThrow('exit 1');
  });

  it('rejects malformed experiments', () => {
    expect(
      () => new AppConfig({NODE_ENV: 'test', EXPERIMENTS: 'x:101'}),
    ).toThrow('EXPERIMENTS');
    expect(() => new AppConfig({NODE_ENV: 'test', EXPERIMENTS: 'x'})).toThrow(
      'EXPERIMENTS',
    );
  });

  describe('encrypted transit (staging and production)', () => {
    const secret = 'x'.repeat(48);
    const prod = (env: NodeJS.ProcessEnv) =>
      new AppConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: secret,
        JWT_SECRET: secret,
        ...env,
      });

    it('accepts TLS everywhere', () => {
      expect(() =>
        prod({
          DB_TYPE: 'postgres',
          DB_URL: 'postgres://app@db:5432/app',
          DB_TLS: 'true',
          CACHE_URL: 'rediss://cache:6379',
          SMTP_URL: 'smtps://mail:465',
          VAULT_ADDR: 'https://vault:8200',
          OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel:4318',
          OIDC_ISSUER: 'https://idp.example/realms/demo',
        }),
      ).not.toThrow();
    });

    it('lists every plaintext connection at once', () => {
      const error = (() => {
        try {
          prod({
            NODE_ENV: 'staging',
            DB_TYPE: 'postgres',
            DB_URL: 'postgres://app@db:5432/app',
            CACHE_URL: 'redis://cache:6379',
            SMTP_URL: 'smtp://mail:25',
            VAULT_ADDR: 'http://vault:8200',
            OIDC_ISSUER: 'http://idp.example',
          });
        } catch (e) {
          return String(e);
        }
        return 'no error';
      })();
      for (const name of [
        'DB_TLS',
        'CACHE_URL',
        'SMTP_URL',
        'VAULT_ADDR',
        'OIDC_ISSUER',
      ]) {
        expect(error).toContain(name);
      }
    });

    it('does not apply to development, test or in-process sql.js', () => {
      expect(
        () => new AppConfig({NODE_ENV: 'test', CACHE_URL: 'redis://c:6379'}),
      ).not.toThrow();
      expect(() => prod({DB_TYPE: 'sqljs'})).not.toThrow();
    });
  });

  describe('DatabaseConfig TLS', () => {
    const options = (env: NodeJS.ProcessEnv) =>
      DatabaseConfig.options(new AppConfig({NODE_ENV: 'test', ...env})) as {
        ssl?: unknown;
        tls?: boolean;
        options?: {encrypt?: boolean};
      };

    it('verifies the server cert when DB_TLS is on', () => {
      const url = {DB_URL: 'x://db/app', DB_TLS: 'true'};
      expect(options({DB_TYPE: 'postgres', ...url}).ssl).toEqual({
        rejectUnauthorized: true,
        ca: undefined,
      });
      expect(options({DB_TYPE: 'mysql', ...url}).ssl).toMatchObject({
        rejectUnauthorized: true,
      });
      expect(options({DB_TYPE: 'mongodb', ...url}).tls).toBe(true);
      expect(options({DB_TYPE: 'mssql', ...url}).options?.encrypt).toBe(true);
      expect(
        options({DB_TYPE: 'postgres', DB_URL: 'x://db'}).ssl,
      ).toBeUndefined();
    });
  });
});
