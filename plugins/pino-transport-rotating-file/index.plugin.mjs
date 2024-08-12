import path from 'node:path';

import build from 'pino-abstract-transport';
import {prettyFactory} from 'pino-pretty';
import {createStream} from 'rotating-file-stream';
import {pipeline, Transform} from 'stream';

/**
 * @function pinoTransportRotatingFile
 * @description A Pino transport plugin that writes logs to a rotating file.
 *
 * @param {Object} options - The options object.
 * @param {string} options.dir - The directory to write the log files.
 * @param {string} options.filename - The base filename for the log files.
 * @param {boolean} options.enabled - Whether the transport is enabled.
 * @param {string} options.size - The size at which to rotate the log files.
 * @param {string} options.interval - The interval at which to rotate the log files.
 * @param {string} options.compress - The compression method to use for rotated files.
 * @param {boolean} options.immutable - Whether to apply immutability to the rotated files.
 *
 * @returns {Object} The Pino transport object.
 *
 * @example
 * ```typescript
 * import path from 'node:path';
 * import {pino, LoggerOptions} from 'pino';
 *
 * export const loggerOptions: LoggerOptions = {
 *   name: 'server start',
 *   level: 'trace',
 *   transport: {
 *     targets: [
 *       {
 *         level: 'info',
 *         target: `${process.cwd()}/plugins/pino-transport-rotating-file/index.plugin.mjs`,
 *         options: {
 *           dir: path.join(process.cwd(), 'logs'),
 *           filename: 'all',
 *           enabled: true,
 *         },
 *       },
 *       {
 *         level: 'error',
 *         target: `${process.cwd()}/plugins/pino-transport-rotating-file/index.plugin.mjs`,
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
    filename: 'app.log',
    enabled: true,
    size: '10M',
    interval: '1d',
    compress: 'gzip',
    immutable: true,
  },
) {
  const {dir, filename, enabled, size, interval, compress, immutable} = options;

  if (!enabled) {
    return build((source) => source, {
      parse: 'lines',
      close() {},
    });
  }

  if (dir == null) {
    throw new Error('Missing required option: dir');
  }

  const pad = (num) => (num > 9 ? '' : '0') + num;
  // The log filename generator
  const generator = (time, index) => {
    if (!time) return path.join(dir, 'app.log');
    const date =
      time.getFullYear() +
      '-' +
      pad(time.getMonth() + 1) +
      '-' +
      pad(time.getDate());
    const _filename = `${filename}-${date}.${index}.log`;
    return path.join(dir, _filename);
  };

  const rotatingStream = createStream(generator, {
    // rotate based on the provided size
    size: size || '10M',
    // rotate based on the provided interval
    interval: interval || '1d',
    // compress using the provided method
    compress: compress || 'gzip',
    // apply immutability based on the provided setting
    immutable: immutable || true,
  });

  return build(
    (source) => {
      const pretty = prettyFactory({colorize: false});

      const prettyStream = new Transform({
        objectMode: true,
        autoDestroy: true,
        transform: (chunk, encoding, callback) => {
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
      // Close is needed to flush the stream, otherwise the logs will be lost.
      async close() {
        await new Promise((resolve) => {
          rotatingStream.end(() => resolve());
        });
      },
    },
  );
}

export default pinoTransportRotatingFile;
