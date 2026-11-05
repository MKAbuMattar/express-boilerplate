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

  constructor(source: NodeJS.ProcessEnv = process.env) {
    this.env = AppConfig.read(source);
    this.corsOrigins = AppConfig.list(this.env.CORS_ORIGINS);
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
      TRUST_PROXY: bool({default: false}),
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
      DB_SYNCHRONIZE: bool({default: false}),

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
