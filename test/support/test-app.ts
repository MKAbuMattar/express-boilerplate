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

  private static certDir?: string;

  static certs(): string {
    TestApp.certDir ??= new LocalCertificateGenerator(
      mkdtempSync(join(tmpdir(), 'boilerplate-certs-')),
      1,
    ).generate();
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
        DB_SYNCHRONIZE: 'true',
        SESSION_SECRET: 'test-session-secret-0123456789abcdef',
        JWT_SECRET: TestApp.JWT_SECRET,
        HMAC_CLIENTS: `partner-a:${TestApp.HMAC_SECRET}`,
        ...env,
      }),
    );
    return {application, app: await application.init()};
  }
}
