# Pino Plugin - Rotating File Transport

This module provides a custom logging transport for the `pino` logger that uses rotating file streams to manage log files. It supports log file rotation based on size and time intervals, and it can be configured to include log file compression.

## Features

- **File Rotation**: Rotates log files based on size and time intervals.
- **Compression**: Compresses rotated log files using gzip.
- **Custom Filename**: Allows customization of the log file name.
- **Enable/Disable**: Option to enable or disable logging.
- **Size Limit**: Configurable size limit for log file rotation.
- **Interval**: Configurable time interval for log file rotation.
- **Compression Method**: Configurable compression method for rotated log files.
- **Immutability**: Option to apply immutability to rotated log files.

## Usage

To use the plugin, import it and provide the required configuration options:

```typescript
import path from 'node:path';
import {pino, LoggerOptions} from 'pino';

const loggerOptions: LoggerOptions = {
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
        target: '@mkabumattar/pino-transport-rotating-file',
        options: {
          dir: path.join(process.cwd(), 'logs'),
          filename: 'all',
          enabled: true,
          size: '20M',
          interval: '1d',
          compress: 'gzip',
          immutable: true,
        },
      },
      {
        level: 'error',
        target: '@mkabumattar/pino-transport-rotating-file',
        options: {
          dir: path.join(process.cwd(), 'logs'),
          filename: 'error',
          enabled: true,
          size: '10M',
          interval: '1d',
          compress: 'gzip',
          immutable: true,
        },
      },
    ],
  },
};

const logger = pino(loggerOptions);

logger.info('Server started');
logger.error('An error occurred');
```

## Configuration Options

The plugin accepts the following options:

- `dir` (string, required): The directory where the log files will be saved.
- `filename` (string, optional): The base name of the log file. Defaults to `app.log`.
- `enabled` (boolean, optional): If `false`, logging is disabled. Defaults to `true`.
- `size` (string, optional): The size at which to rotate the log files. Defaults to `'10M'`.
- `interval` (string, optional): The interval at which to rotate the log files. Defaults to `'1d'`.
- `compress` (string, optional): The compression method to use for rotated files. Defaults to `'gzip'`.
- `immutable` (boolean, optional): Whether to apply immutability to the rotated files. Defaults to `true`.

### Example Configuration

```typescript
{
  dir: '/var/log/app',
  filename: 'app',
  enabled: true,
  size: '20M',
  interval: '1d',
  compress: 'gzip',
  immutable: true,
}
```

## File Rotation

The log files are rotated based on the following parameters:

- **Size**: `10 MegaBytes (10M)` - Log files are rotated when they reach this size (configurable).
- **Interval**: `1 day (1d)` - Log files are rotated daily (configurable).
- **Compression**: `gzip` - Rotated files are compressed using gzip (configurable).
- **Filename Pattern**: `${filename}-${date}.${index}.log` - Log files are named based on the provided filename, date, and index.

## Notes

- Ensure that the directory specified in `dir` exists and is writable by the application.
- The `enabled` option can be used to turn off logging without removing the transport configuration.
- The `compress` option accepts various methods, but make sure the chosen method is supported by `rotating-file-stream`.

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
