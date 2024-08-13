import path from 'node:path';

import {LoggerOptions} from 'pino';

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
        target: `@mkabumattar/pino-transport-rotating-file`,
        options: {
          dir: path.join(process.cwd(), 'logs'),
          filename: 'all',
          enabled: true,
        },
      },
      {
        level: 'error',
        target: `@mkabumattar/pino-transport-rotating-file`,
        options: {
          dir: path.join(process.cwd(), 'logs'),
          filename: 'error',
          enabled: true,
        },
      },
    ],
  },
};
