import {bool, cleanEnv, makeValidator, num, port, str, url} from 'envalid';

import {SecurityConstants} from '../constant/security.constants.js';
import {CacheType} from '../enumeration/cache-type.enum.js';
import {DatabaseType} from '../enumeration/database-type.enum.js';

export type Env = ReturnType<(typeof AppConfig)['read']>;

export class AppConfig {
  readonly env: Env;
  readonly hmacClients: ReadonlyMap<string, string>;
  readonly corsOrigins: string[];
  readonly experiments: ReadonlyMap<string, number>;
  /** Hops for Express 'trust proxy'; false when not behind a proxy. */
  readonly trustProxy: number | false;

  constructor(source: NodeJS.ProcessEnv = process.env) {
    this.env = AppConfig.read(source);
    this.corsOrigins = AppConfig.list(this.env.CORS_ORIGINS);
    // A hop count, never `true`: `true` trusts the leftmost X-Forwarded-For,
    // which the client writes, so anyone could pick their own rate-limit IP.
    const proxy = this.env.TRUST_PROXY.trim().toLowerCase();
    const hops = proxy === 'true' ? 1 : proxy === 'false' ? 0 : Number(proxy);
    if (!Number.isInteger(hops) || hops < 0) {
      throw new Error('TRUST_PROXY must be false, true or a hop count');
    }
    this.trustProxy = hops === 0 ? false : hops;
    this.experiments = new Map(
      AppConfig.list(this.env.EXPERIMENTS).map((pair) => {
        const [name = '', percent = ''] = pair.split(':');
        const percentA = percent.trim() === '' ? Number.NaN : Number(percent);
        if (
          !name ||
          !Number.isInteger(percentA) ||
          percentA < 0 ||
          percentA > 100
        ) {
          throw new Error(`EXPERIMENTS: "${pair}" must be name:0..100`);
        }
        return [name, percentA] as const;
      }),
    );
    this.hmacClients = new Map(
      AppConfig.list(this.env.HMAC_CLIENTS).map((pair) => {
        const index = pair.indexOf(':');
        return [pair.slice(0, index), pair.slice(index + 1)] as const;
      }),
    );
  }

  get isDevelopment(): boolean {
    return this.env.NODE_ENV === 'development';
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  private static readonly secret = makeValidator<string>((value) => {
    if (value.length < SecurityConstants.MIN_SECRET_LENGTH) {
      throw new Error(
        `must be at least ${SecurityConstants.MIN_SECRET_LENGTH} characters`,
      );
    }
    return value;
  });

  private static readonly optionalSecret = makeValidator<string>((value) => {
    if (value !== '' && value.length < SecurityConstants.MIN_SECRET_LENGTH) {
      throw new Error(
        `must be empty or at least ${SecurityConstants.MIN_SECRET_LENGTH} characters`,
      );
    }
    return value;
  });

  static read(source: NodeJS.ProcessEnv) {
    return cleanEnv(source, {
      NODE_ENV: str({
        choices: ['development', 'test', 'staging', 'production'],
        default: 'development',
      }),
      HOST: str({default: '0.0.0.0'}),
      PORT: port({default: 443}),
      PUBLIC_URL: url({default: 'https://localhost'}),
      TRUST_PROXY: str({
        default: 'false',
        desc: 'false, or proxy hops in front of the app (true means 1)',
      }),
      MTLS_FORWARDED_HEADER: str({
        default: '',
        desc: 'Header the edge proxy puts the client cert in (base64 DER)',
      }),
      MTLS_TRUSTED_PROXY_CN: str({
        default: 'edge-proxy',
        desc: 'CN of the proxy client cert allowed to forward client certs',
      }),
      CORS_ORIGINS: str({default: '', desc: 'Comma-separated origins'}),

      TLS_ENABLED: bool({default: true}),
      TLS_KEY_FILE: str({default: 'certs/server.key'}),
      TLS_CERT_FILE: str({default: 'certs/server.crt'}),
      TLS_CA_FILE: str({default: 'certs/ca.crt', desc: 'CA for mTLS clients'}),

      DB_TYPE: str({
        choices: Object.values(DatabaseType),
        default: DatabaseType.Sqljs,
      }),
      DB_URL: str({
        default: '',
        desc: 'Connection URL, or file path for sqljs',
      }),
      DB_SYNCHRONIZE: bool({
        default: false,
        desc: 'Prototype only: lets TypeORM rewrite the schema. Use migrations.',
      }),
      DB_MIGRATIONS_RUN: bool({
        default: true,
        desc: 'Apply pending migrations at startup',
      }),

      CACHE_TYPE: str({
        choices: Object.values(CacheType),
        default: CacheType.Memory,
      }),
      CACHE_URL: str({default: '', desc: 'redis:// or rediss:// (TLS)'}),
      CACHE_CLUSTER: bool({
        default: false,
        desc: 'Redis/ElastiCache cluster mode',
      }),
      CACHE_TTL_SECONDS: num({default: 60}),
      CACHE_PREFIX: str({default: 'app:'}),
      CACHE_TIMEOUT_MS: num({
        default: 200,
        desc: 'Cache calls slower than this count as a miss',
      }),

      WS_ENABLED: bool({default: true, desc: 'WebSocket on the HTTP(S) port'}),
      WS_PATH: str({default: '/ws'}),
      WS_MAX_PAYLOAD_BYTES: num({default: 64 * 1024}),
      TCP_ENABLED: bool({default: false}),
      TCP_PORT: port({default: 9443, desc: 'TLS when TLS_ENABLED'}),
      UDP_ENABLED: bool({default: false}),
      UDP_PORT: port({default: 9444}),
      PING_TIMEOUT_MS: num({default: 2000}),

      QUEUE_TYPE: str({choices: ['memory', 'bullmq'], default: 'memory'}),
      QUEUE_URL: str({default: '', desc: 'Redis URL; empty uses CACHE_URL'}),
      QUEUE_ATTEMPTS: num({
        default: 3,
        desc: 'Tries before a job is dead-lettered',
      }),
      QUEUE_BACKOFF_MS: num({default: 500, desc: 'Exponential backoff base'}),

      RATE_LIMIT_ENABLED: bool({default: true}),
      RATE_LIMIT_WINDOW_SECONDS: num({default: 60}),
      RATE_LIMIT_MAX: num({default: 300, desc: 'Requests per IP per window'}),
      RATE_LIMIT_AUTH_MAX: num({
        default: 20,
        desc: 'Requests per IP per window on /auth (login brute force)',
      }),
      HTTP_HEADERS_TIMEOUT_MS: num({
        default: 10_000,
        desc: 'Slowloris guard: time allowed to send request headers',
      }),
      HTTP_REQUEST_TIMEOUT_MS: num({default: 30_000}),
      HTTP_KEEP_ALIVE_TIMEOUT_MS: num({default: 5_000}),

      EXPERIMENTS: str({
        default: 'new-checkout:50',
        desc: 'A/B experiments as name:percentInA,name:percentInA',
      }),

      SESSION_SECRET: AppConfig.secret({
        devDefault: 'dev-only-session-secret-0123456789abcdef',
      }),
      JWT_SECRET: AppConfig.optionalSecret({default: ''}),
      JWT_ISSUER: str({default: 'express-boilerplate'}),
      JWT_AUDIENCE: str({default: 'express-boilerplate'}),
      HMAC_CLIENTS: str({default: '', desc: 'clientId:secret,clientId:secret'}),

      OAUTH2_ISSUER: str({default: ''}),
      OAUTH2_AUDIENCE: str({default: ''}),
      OAUTH2_JWKS_URI: str({default: ''}),

      OIDC_ISSUER: str({default: ''}),
      OIDC_CLIENT_ID: str({default: ''}),
      OIDC_CLIENT_SECRET: str({default: ''}),

      SAML_ENTRY_POINT: str({default: ''}),
      SAML_ISSUER: str({default: ''}),
      SAML_IDP_CERT: str({default: '', desc: 'IdP signing cert, PEM body'}),
    });
  }

  private static list(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
