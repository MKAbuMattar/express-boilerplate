import {join} from 'node:path';
import {
  type Level,
  type LoggerOptions,
  pino,
  type TransportPipelineOptions,
  type TransportTargetOptions,
} from 'pino';
import type {PinoTransportOptions} from 'pino-transport-rotating-file';

const levels = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
] satisfies Array<Level>;

const createTransportOptions = (filename: string): PinoTransportOptions =>
  ({
    dir: join(process.cwd(), 'logs'),
    filename,
    enabled: true,
    size: '100K',
    interval: '1d',
    compress: true,
    immutable: true,
    retentionDays: 30,
    compressionOptions: {
      level: 6,
      strategy: 0,
    },
    errorLogFile: join(process.cwd(), 'logs', 'errors.log'),
    timestampFormat: 'iso',
    skipPretty: false,
    errorFlushIntervalMs: 60_000,
  }) satisfies PinoTransportOptions;

const targets: Array<TransportTargetOptions | TransportPipelineOptions> =
  levels.map((level: Level) => ({
    level,
    target: 'pino-transport-rotating-file',
    options: createTransportOptions(level === 'trace' ? 'all' : level),
  }));

export const loggerOptions: LoggerOptions = {
  name: 'playground',
  level: 'trace',
  transport: {
    targets: [
      {
        level: 'trace',
        target: 'pino-pretty',
        options: {colorize: true},
      },
      ...targets,
    ],
  },
} satisfies LoggerOptions;

export const logger = pino(loggerOptions);
