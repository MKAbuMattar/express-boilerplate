import path from 'node:path';

import build from 'pino-abstract-transport';
import {prettyFactory} from 'pino-pretty';
import {createStream} from 'rotating-file-stream';
import {pipeline, Transform} from 'stream';

export default async function (options = {dir: ''}) {
  const {dir} = options;

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
    const filename = `${date}.${index}.log`;
    return path.join(dir, filename);
  };

  const rotatingStream = createStream(generator, {
    size: '10M', // rotate every 10 MegaBytes written
    interval: '1d', // rotate daily
    compress: 'gzip', // compress rotated files
    immutable: true,
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
