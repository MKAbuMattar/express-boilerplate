import path from 'node:path';
import {Transform, pipeline} from 'node:stream';

import build from 'pino-abstract-transport';
import {prettyFactory} from 'pino-pretty';
import {createStream} from 'rotating-file-stream';

/**
 * @typedef {Object} PinoTransportOptions
 * @property {string} dir - The directory to write the log files.
 * @property {string} filename - The base filename for the log files.
 * @property {boolean} enabled - Whether the transport is enabled.
 * @property {string} size - The size at which to rotate the log files.
 * @property {string} interval - The interval at which to rotate the log files.
 * @property {string} compress - The compression method to use for rotated files.
 * @property {boolean} immutable - Whether to apply immutability to the rotated files.
 */

/**
 * @function pinoTransportRotatingFile
 * @description A Pino transport plugin that writes logs to a rotating file.
 *
 * @param {PinoTransportOptions} options - The options object.
 * @returns {Object} The Pino transport object.
 *
 * @example
 * ```typescript
 * import path from 'node:path';
 * import { pino, LoggerOptions } from 'pino';
 *
 * const loggerOptions: LoggerOptions = {
 *   name: 'server start',
 *   level: 'trace',
 *   transport: {
 *     targets: [
 *       {
 *         level: 'info',
 *         target: '@mkabumattar/pino-transport-rotating-file',
 *         options: {
 *           dir: path.join(process.cwd(), 'logs'),
 *           filename: 'all',
 *           enabled: true,
 *         },
 *       },
 *       {
 *         level: 'error',
 *         target: '@mkabumattar/pino-transport-rotating-file',
 *         options: {
 *           dir: path.join(process.cwd(), 'logs'),
 *           filename: 'error',
 *           enabled: true,
 *         },
 *       },
 *     ],
 *   },
 * };
 *
 * const logger = pino(loggerOptions);
 * logger.info('Server started');
 * logger.error('An error occurred');
 * ```
 */
async function pinoTransportRotatingFile(
  options = {
    dir: '',
    filename: 'app',
    enabled: true,
    size: '10M',
    interval: '1d',
    compress: 'gzip',
    immutable: true,
  },
) {
  const {
    dir = '',
    filename = 'app',
    enabled = true,
    size = '10M',
    interval = '1d',
    compress = 'gzip',
    immutable = true,
  } = options;

  if (!enabled) {
    return build((source) => source, {
      parse: 'lines',
      close() {},
    });
  }

  if (!dir) {
    throw new Error('Missing required option: dir');
  }

  const pad = (num) => num.toString().padStart(2, '0');
  const generator = (time, index) => {
    if (!time) return path.join(dir, 'app.log');
    const date = `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;
    return path.join(dir, `${filename}-${date}.${index}.log`);
  };

  const rotatingStream = createStream(generator, {
    size,
    interval,
    compress,
    immutable,
  });

  return build(
    (source) => {
      const pretty = prettyFactory({colorize: false});

      const prettyStream = new Transform({
        objectMode: true,
        autoDestroy: true,
        transform(chunk, encoding, callback) {
          callback(null, pretty(chunk));
        },
      });

      pipeline(source, prettyStream, rotatingStream, (err) => {
        if (err) {
          console.error('Failed to write log in transport:', err);
        }
      });

      return prettyStream;
    },
    {
      parse: 'lines',
      async close() {
        await new Promise((resolve) => {
          rotatingStream.end(() => resolve());
        });
      },
    },
  );
}

export default pinoTransportRotatingFile;
