import https from 'node:https';
import {Tracing} from '@express-boilerplate/common/config/observability/tracing.js';
import {ServerHardening} from '@express-boilerplate/common/config/server-hardening.js';
import {TlsConfig} from '@express-boilerplate/common/config/tls.config.js';
import {VaultSecrets} from '@express-boilerplate/common/config/vault-secrets.js';
import {AppLogger} from '@express-boilerplate/common/util/app-logger.js';
import {Application} from './application.js';

export class Main {
  private static readonly SHUTDOWN_TIMEOUT_MS = 10_000;

  static async run(): Promise<void> {
    // Secrets first (they may include OTEL_* or DB settings), then tracing,
    // which must patch HTTP before the server exists.
    // @feature:vault
    const fromVault = await VaultSecrets.load();
    // @end:vault
    // @feature:tracing
    Tracing.start();
    // @end:tracing
    const application = new Application();
    const {config} = application;
    const {logger} = application.beans.getBean(AppLogger);
    const app = await application.init();

    const limits = ServerHardening.CREATE_OPTIONS;
    const server = ServerHardening.apply(
      https.createServer({...TlsConfig.serverOptions(config), ...limits}, app),
      config,
    );

    // @feature:transports
    application.startTransports(server);
    // @end:transports
    // @feature:vault
    if (fromVault.length > 0) {
      logger.info({keys: fromVault}, 'Secrets loaded from Vault');
    }
    // @end:vault
    server.once('error', (error: NodeJS.ErrnoException) => {
      // Ports below 1024 need a privilege most Linux setups do not grant.
      if (error.code === 'EACCES' && config.env.PORT < 1024) {
        logger.fatal(
          `Cannot bind port ${config.env.PORT}. Allow it once with: ` +
            `sudo sysctl -w net.ipv4.ip_unprivileged_port_start=${config.env.PORT}`,
        );
        process.exit(1);
      }
      throw error;
    });
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
        // @feature:tracing
        .then(() => Tracing.stop())
        // @end:tracing
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
