import {logger} from '@/libs/logger.lib';
import {app} from '@/server';
import {env} from '@/utils/env-config.util';

const server = app.listen(env.PORT, () => {
  const {NODE_ENV, HOST, PORT} = env;
  logger.info(
    `Server (${NODE_ENV}) running on port http://${HOST}:${PORT}/docs`,
  );
});

const onCloseSignal = () => {
  logger.info('sigint received, shutting down');
  server.close(() => {
    logger.info('server closed');
    process.exit();
  });
  setTimeout(() => process.exit(1), 10000).unref(); // Force shutdown after 10s
};

process.on('SIGINT', onCloseSignal);
process.on('SIGTERM', onCloseSignal);
