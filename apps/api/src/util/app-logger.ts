import {type Logger, pino} from 'pino';
import type {AppConfig} from '../config/app.config.js';

export class AppLogger {
  readonly logger: Logger;

  constructor(config: AppConfig) {
    this.logger = pino({
      level: config.env.NODE_ENV === 'test' ? 'silent' : 'info',
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-signature"]',
        'res.headers["set-cookie"]',
      ],
      // Pretty logs only in a dev terminal; containers get JSON and do not
      // ship pino-pretty (a devDependency).
      transport:
        config.isDevelopment && process.stdout.isTTY
          ? {target: 'pino-pretty', options: {colorize: true}}
          : undefined,
    });
  }
}
