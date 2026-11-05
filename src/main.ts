import http from 'node:http';
import https from 'node:https';
import {Application} from './application.js';
import {ServerHardening} from './config/server-hardening.js';
import {TlsConfig} from './config/tls.config.js';
import {AppLogger} from './util/app-logger.js';

export class Main {
  private static readonly SHUTDOWN_TIMEOUT_MS = 10_000;

  static async run(): Promise<void> {
    const application = new Application();
    const {config} = application;
    const {logger} = application.beans.getBean(AppLogger);
    const app = await application.init();

    const limits = ServerHardening.CREATE_OPTIONS;
    const server = ServerHardening.apply(
      config.env.TLS_ENABLED
        ? https.createServer(
            {...TlsConfig.serverOptions(config), ...limits},
            app,
          )
        : http.createServer(limits, app),
      config,
    );

    await application.startTransports(server);
    server.listen(config.env.PORT, config.env.HOST, () => {
      const scheme = config.env.TLS_ENABLED ? 'https' : 'http';
      logger.info(
        `Server (${config.env.NODE_ENV}) on ${scheme}://${config.env.HOST}:${config.env.PORT}` +
          (config.isDevelopment ? ` docs: ${config.env.PUBLIC_URL}/docs` : ''),
      );
    });

    const shutdown = (signal: string) => {
      logger.info(`${signal} received, shutting down`);
      setTimeout(() => process.exit(1), Main.SHUTDOWN_TIMEOUT_MS).unref();
      application.close(server).then(
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
