import path from 'node:path';
import {type LoggerOptions, pino} from 'pino';

export const loggerOptions: LoggerOptions = {
  name: 'server start',
  level: 'trace',
  transport: {
    targets: [
      {
        level: 'info',
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
      {
        level: 'info',
        target: 'pino-transport-rotating',
        options: {
          dir: path.join(process.cwd(), 'logs'),
          filename: 'all',
          enabled: true,
        },
      },
      {
        level: 'error',
        target: 'pino-transport-rotating',
        options: {
          dir: path.join(process.cwd(), 'logs'),
          filename: 'error',
          enabled: true,
        },
      },
    ],
  },
} satisfies LoggerOptions;

export const logger = pino(loggerOptions);
