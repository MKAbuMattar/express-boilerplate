import {bool, cleanEnv, makeValidator, num, port, str, url} from 'envalid';

import {SecurityConstants} from '../constant/security.constants.js';
import {CacheType} from '../enumeration/cache-type.enum.js';
import {DatabaseType} from '../enumeration/database-type.enum.js';

type Env = ReturnType<(typeof AppConfig)['read']>;

export class AppConfig {
  readonly env: Env;
  // @feature:auth-hmac
  readonly hmacClients: ReadonlyMap<string, string>;
  // @end:auth-hmac
  readonly corsOrigins: string[];
  // @feature:experiments
  readonly experiments: ReadonlyMap<string, number>;
  // @end:experiments
  // @feature:auth-hmac
  readonly hmacClientScopes: ReadonlyMap<string, string>;
  // @end:auth-hmac
  // @feature:auth-mtls
  readonly mtlsClientScopes: ReadonlyMap<string, string>;
  // @end:auth-mtls
  /** Hops for Express 'trust proxy'; false when not behind a proxy. */
  readonly trustProxy: number | false;

  constructor(source: NodeJS.ProcessEnv = process.env) {
    this.env = AppConfig.read(source);
    this.corsOrigins = AppConfig.list(this.env.CORS_ORIGINS);
    // @feature:auth-hmac
    this.hmacClientScopes = AppConfig.scopeMap(this.env.HMAC_CLIENT_SCOPES);
    // @end:auth-hmac
    // @feature:auth-mtls
    this.mtlsClientScopes = AppConfig.scopeMap(this.env.MTLS_CLIENT_SCOPES);
    // @end:auth-mtls
    // A hop count, never `true`: `true` trusts the leftmost X-Forwarded-For,
    // which the client writes, so anyone could pick their own rate-limit IP.
    const proxy = this.env.TRUST_PROXY.trim().toLowerCase();
    const hops = proxy === 'true' ? 1 : proxy === 'false' ? 0 : Number(proxy);
    if (!Number.isInteger(hops) || hops < 0) {
      throw new Error('TRUST_PROXY must be false, true or a hop count');
    }
    this.trustProxy = hops === 0 ? false : hops;
    if (this.env.NODE_ENV === 'production' || this.env.NODE_ENV === 'staging') {
      AppConfig.requireEncryptedTransit(this.env);
    }
    // @feature:experiments
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
    // @end:experiments
    // @feature:auth-hmac
    this.hmacClients = new Map(
      AppConfig.list(this.env.HMAC_CLIENTS).map((pair) => {
        const index = pair.indexOf(':');
        return [pair.slice(0, index), pair.slice(index + 1)] as const;
      }),
    );
    // @end:auth-hmac
  }

  get isDevelopment(): boolean {
    return this.env.NODE_ENV === 'development';
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  /** Every cookie the app sets: no script access, HTTPS only outside tests. */
  get cookieOptions(): {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: string;
  } {
    return {
      httpOnly: true,
      secure: this.env.NODE_ENV !== 'test',
      sameSite: 'lax',
      path: '/',
    };
  }

  /**
   * Every connection the app makes leaves over TLS. Fails startup with the
   * full list of plaintext settings; sql.js is in-process, so it has none.
   */
  static requireEncryptedTransit(env: Env): void {
    const plain: string[] = [];
    if (!env.PUBLIC_URL.startsWith('https://')) {
      plain.push('PUBLIC_URL must use https://');
    }
    if (env.DB_TYPE !== DatabaseType.Sqljs && !env.DB_TLS) {
      plain.push('DB_TLS must be true');
    }
    // @feature:redis
    AppConfig.checkScheme(plain, 'CACHE_URL', env.CACHE_URL, ['rediss://']);
    // @end:redis
    // @feature:redis
    AppConfig.checkScheme(plain, 'QUEUE_URL', env.QUEUE_URL, ['rediss://']);
    // @end:redis
    // @feature:mail
    AppConfig.checkScheme(plain, 'SMTP_URL', env.SMTP_URL, ['smtps://']);
    // @end:mail
    // @feature:vault
    AppConfig.checkScheme(plain, 'VAULT_ADDR', env.VAULT_ADDR, ['https://']);
    // @end:vault
    // @feature:tracing
    AppConfig.checkScheme(
      plain,
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      env.OTEL_EXPORTER_OTLP_ENDPOINT,
      ['https://'],
    );
    // @end:tracing
    // @feature:auth-oauth2
    AppConfig.checkScheme(plain, 'OAUTH2_ISSUER', env.OAUTH2_ISSUER, [
      'https://',
    ]);
    // @end:auth-oauth2
    // @feature:auth-oidc
    AppConfig.checkScheme(plain, 'OIDC_ISSUER', env.OIDC_ISSUER, ['https://']);
    // @end:auth-oidc
    if (plain.length > 0) {
      throw new Error(`Encrypted transit required: ${plain.join('; ')}`);
    }
  }

  /** Adds a finding when value is set and uses none of the allowed schemes. */
  static checkScheme(
    findings: string[],
    name: string,
    value: string,
    allowed: string[],
  ): void {
    if (value && !allowed.some((s) => value.startsWith(s))) {
      findings.push(`${name} must use ${allowed.join(' or ')}`);
    }
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
      // @feature:auth-mtls
      MTLS_FORWARDED_HEADER: str({
        default: '',
        desc: 'Header the edge proxy puts the client cert in (base64 DER)',
      }),
      // @end:auth-mtls
      // @feature:auth-mtls
      MTLS_TRUSTED_PROXY_CN: str({
        default: 'edge-proxy',
        desc: 'CN of the proxy client cert allowed to forward client certs',
      }),
      // @end:auth-mtls
      CORS_ORIGINS: str({default: '', desc: 'Comma-separated origins'}),

      TLS_KEY_FILE: str({default: 'certs/server.key'}),
      TLS_CERT_FILE: str({default: 'certs/server.crt'}),
      TLS_CA_FILE: str({default: 'certs/ca.crt', desc: 'CA for mTLS clients'}),
      TLS_CLIENT_AUTH: str({
        choices: ['none', 'require'],
        default: 'none',
        desc: 'require: every connection must present a cert signed by TLS_CA_FILE',
      }),

      DB_TYPE: str({
        choices: Object.values(DatabaseType),
        default: DatabaseType.Sqljs,
      }),
      DB_URL: str({
        default: '',
        desc: 'Connection URL, or file path for sqljs',
      }),
      DB_TLS: bool({
        default: false,
        desc: 'Verified TLS to the database (required outside development/test)',
      }),
      DB_TLS_CA_FILE: str({
        default: '',
        desc: 'CA for the database server cert; empty uses the system CAs',
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
      // @feature:redis
      CACHE_URL: str({default: '', desc: 'redis:// or rediss:// (TLS)'}),
      // @end:redis
      // @feature:redis
      CACHE_CLUSTER: bool({
        default: false,
        desc: 'Redis/ElastiCache cluster mode',
      }),
      // @end:redis
      CACHE_TTL_SECONDS: num({default: 60}),
      CACHE_PREFIX: str({default: 'app:'}),
      CACHE_TIMEOUT_MS: num({
        default: 200,
        desc: 'Cache calls slower than this count as a miss',
      }),

      // @feature:websocket
      WS_ENABLED: bool({default: true, desc: 'WebSocket on the HTTP(S) port'}),
      WS_PATH: str({default: '/ws'}),
      WS_MAX_PAYLOAD_BYTES: num({default: 64 * 1024}),
      // @end:websocket
      // @feature:tcp
      TCP_ENABLED: bool({
        default: false,
        desc: 'Line protocol on the HTTPS port, ALPN ndjson/1',
      }),
      // @end:tcp
      // @feature:network
      PING_TIMEOUT_MS: num({default: 2000}),
      // @end:network

      QUEUE_TYPE: str({
        // @feature:redis
        choices: ['memory', 'bullmq'],
        // @end:redis
        // @feature:!redis
        //~ choices: ['memory'],
        // @end:!redis
        default: 'memory',
      }),
      // @feature:redis
      QUEUE_URL: str({default: '', desc: 'Redis URL; empty uses CACHE_URL'}),
      // @end:redis
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
      ALLOWED_HOSTS: str({
        default: '',
        desc: 'Extra Host names to serve, comma-separated (PUBLIC_URL host is always allowed)',
      }),
      OPS_ALLOWED_CIDRS: str({
        default:
          '127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7',
        desc: 'Networks allowed to call ops routes (queues, network)',
      }),
      IDEMPOTENCY_TTL_SECONDS: num({default: 24 * 60 * 60}),
      JSON_MAX_DEPTH: num({default: 32}),
      JSON_MAX_NODES: num({default: 10_000}),
      HTTP_HANDLER_TIMEOUT_MS: num({
        default: 15_000,
        desc: 'Answer 503 if a handler runs longer than this',
      }),
      HTTP_HEADERS_TIMEOUT_MS: num({
        default: 10_000,
        desc: 'Slowloris guard: time allowed to send request headers',
      }),
      HTTP_REQUEST_TIMEOUT_MS: num({default: 30_000}),
      HTTP_KEEP_ALIVE_TIMEOUT_MS: num({default: 5_000}),

      // @feature:mail
      SMTP_URL: str({
        default: '',
        desc: 'smtp://host:port or smtps://; empty logs instead of sending',
      }),
      MAIL_FROM: str({default: 'Express Boilerplate <no-reply@example.com>'}),
      // @end:mail
      // @feature:metrics
      METRICS_ENABLED: bool({
        default: true,
        desc: 'Prometheus metrics at GET /metrics',
      }),
      // @end:metrics
      HEALTH_SHOW_DETAILS: str({
        choices: ['never', 'always'],
        default: 'never',
        desc: 'Actuator show-details: component details in health responses',
      }),
      // @feature:vault
      // Read before AppConfig by VaultSecrets; listed for docs.
      VAULT_ADDR: str({
        default: '',
        desc: 'Load secrets from Vault KV v2 at startup',
      }),
      VAULT_TOKEN: str({default: ''}),
      VAULT_ROLE_ID: str({default: ''}),
      VAULT_SECRET_ID: str({default: ''}),
      VAULT_KV_MOUNT: str({default: 'secret'}),
      VAULT_SECRET_PATH: str({default: 'express-boilerplate'}),
      // @end:vault
      // @feature:tracing
      // Read before AppConfig by Tracing; listed for docs.
      OTEL_EXPORTER_OTLP_ENDPOINT: str({default: '', desc: 'Turns tracing on'}),
      OTEL_SERVICE_NAME: str({default: 'express-boilerplate'}),
      // @end:tracing

      // @feature:experiments
      EXPERIMENTS: str({
        default: 'new-checkout:50',
        desc: 'A/B experiments as name:percentInA,name:percentInA',
      }),
      // @end:experiments

      SESSION_SECRET: AppConfig.secret({
        devDefault: 'dev-only-session-secret-0123456789abcdef',
      }),
      JWT_ALGORITHM: str({choices: ['HS256', 'ES256'], default: 'HS256'}),
      JWT_SECRET: AppConfig.optionalSecret({default: ''}),
      JWT_PRIVATE_KEY_FILE: str({
        default: '',
        desc: 'ES256 signing key (PKCS#8 PEM)',
      }),
      JWT_PUBLIC_KEY_FILES: str({
        default: '',
        desc: 'Previous ES256 public keys still accepted (rotation), comma-separated',
      }),
      JWT_CLOCK_TOLERANCE_SECONDS: num({default: 30}),
      JWT_ISSUER: str({default: 'express-boilerplate'}),
      JWT_AUDIENCE: str({default: 'express-boilerplate'}),
      // @feature:auth-hmac
      HMAC_CLIENTS: str({default: '', desc: 'clientId:secret,clientId:secret'}),
      HMAC_CLIENT_SCOPES: str({
        default: '',
        desc: 'clientId=scope scope,clientId=scope (what each HMAC client may do)',
      }),
      // @end:auth-hmac
      // @feature:auth-mtls
      MTLS_CLIENT_SCOPES: str({
        default: '',
        desc: 'certCN=scope scope,certCN=scope (what each mTLS client may do)',
      }),
      // @end:auth-mtls

      // @feature:auth-oauth2
      OAUTH2_ISSUER: str({default: ''}),
      OAUTH2_AUDIENCE: str({default: ''}),
      OAUTH2_JWKS_URI: str({default: ''}),
      // @end:auth-oauth2

      // @feature:auth-oidc
      OIDC_ISSUER: str({default: ''}),
      OIDC_CLIENT_ID: str({default: ''}),
      OIDC_CLIENT_SECRET: str({default: ''}),
      // @end:auth-oidc

      // @feature:auth-saml
      SAML_ENTRY_POINT: str({default: ''}),
      SAML_ISSUER: str({default: ''}),
      SAML_IDP_CERT: str({default: '', desc: 'IdP signing cert, PEM body'}),
      // @end:auth-saml
    });
  }

  /** "name=scope scope,name2=scope" to name -> "scope scope". */
  static scopeMap(value: string): Map<string, string> {
    return new Map(
      AppConfig.list(value).map((entry) => {
        const index = entry.indexOf('=');
        if (index < 1)
          throw new Error(`Bad scope entry "${entry}": use name=scope scope`);
        return [
          entry.slice(0, index).trim(),
          entry.slice(index + 1).trim(),
        ] as const;
      }),
    );
  }

  private static list(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
