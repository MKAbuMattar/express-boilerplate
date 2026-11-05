import https from 'node:https';
import {Application} from './application.js';
import {Tracing} from './config/observability/tracing.js';
import {ServerHardening} from './config/server-hardening.js';
import {TlsConfig} from './config/tls.config.js';
import {VaultSecrets} from './config/vault-secrets.js';
import {AppLogger} from './util/app-logger.js';

export class Main {
  private static readonly SHUTDOWN_TIMEOUT_MS = 10_000;

  static async run(): Promise<void> {
    // Secrets first (they may include OTEL_* or DB settings), then tracing,
    // which must patch HTTP before the server exists.
    const fromVault = await VaultSecrets.load();
    Tracing.start();
    const application = new Application();
    const {config} = application;
    const {logger} = application.beans.getBean(AppLogger);
    const app = await application.init();

    const limits = ServerHardening.CREATE_OPTIONS;
    const server = ServerHardening.apply(
      https.createServer({...TlsConfig.serverOptions(config), ...limits}, app),
      config,
    );

    application.startTransports(server);
    if (fromVault.length > 0) {
      logger.info({keys: fromVault}, 'Secrets loaded from Vault');
    }
    server.listen(config.env.PORT, config.env.HOST, () => {
      logger.info(
        `Server (${config.env.NODE_ENV}) on https://${config.env.HOST}:${config.env.PORT}` +
          (config.isDevelopment ? ` docs: ${config.env.PUBLIC_URL}/docs` : ''),
      );
    });

    const shutdown = (signal: string) => {
      logger.info(`${signal} received, shutting down`);
      setTimeout(() => process.exit(1), Main.SHUTDOWN_TIMEOUT_MS).unref();
      application
        .close(server)
        .then(() => Tracing.stop())
        .then(
          () => process.exit(0),
          (error: unknown) => {
            logger.error({err: error}, 'Shutdown failed');
            process.exit(1);
          },
        );
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
}

await Main.run();
