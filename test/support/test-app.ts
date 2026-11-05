import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type express from 'express';
import {LocalCertificateGenerator} from '../../scripts/generate-certs.js';
import {Application} from '../../src/application.js';
import {AppConfig} from '../../src/config/app.config.js';

export class TestApp {
  static readonly JWT_SECRET = 'test-jwt-secret-0123456789abcdef0123';
  static readonly HMAC_SECRET = 'test-hmac-secret';
  /** Claims for a token that may call every protected route. */
  static readonly ALL_SCOPES = {scope: 'users:write ops:queues ops:network'};

  private static certDir?: string;

  static certs(): string {
    if (!TestApp.certDir) {
      const dir = mkdtempSync(join(tmpdir(), 'boilerplate-certs-'));
      new LocalCertificateGenerator(dir, 1).generate();
      TestApp.certDir = dir;
    }
    return TestApp.certDir;
  }

  static async create(
    env: Record<string, string> = {},
  ): Promise<{application: Application; app: express.Application}> {
    const application = new Application(
      new AppConfig({
        NODE_ENV: 'test',
        TLS_ENABLED: 'false',
        DB_TYPE: 'sqljs',
        SESSION_SECRET: 'test-session-secret-0123456789abcdef',
        JWT_SECRET: TestApp.JWT_SECRET,
        HMAC_CLIENTS: `partner-a:${TestApp.HMAC_SECRET}`,
        // Tests fire hundreds of requests from one IP; the limiter has its own test.
        RATE_LIMIT_ENABLED: 'false',
        ...env,
      }),
    );
    return {application, app: await application.init()};
  }
}
