// import path from 'node:path';
import * as path from 'path';
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
        target: `${process.cwd()}/plugins/pino-transport-rotating-file.plugin.mjs`,
        options: {dir: path.join(process.cwd(), 'logs')},
      },
      // {
      //   level: 'info',
      //   target: 'pino-pretty',
      //   options: {
      //     colorize: false,
      //     mkdir: true,
      //     destination: path.join(process.cwd(), 'logs', 'all.log'),
      //   },
      // },
      {
        level: 'error',
        target: 'pino-pretty',
        options: {
          colorize: false,
          mkdir: true,
          destination: path.join(process.cwd(), 'logs', 'error.log'),
        },
      },
    ],
  },
};
