import dotenv from 'dotenv';
import {cleanEnv, host, port, str, testOnly} from 'envalid';

dotenv.config();

function getEnv() {
  return cleanEnv(process.env, {
    NODE_ENV: str({
      devDefault: testOnly('test'),
      choices: ['test', 'development', 'staging', 'production'],
    }),
    HOST: host({devDefault: testOnly('localhost')}),
    PORT: port({devDefault: testOnly(8080)}),
    CORS_WHITELIST: str({
      devDefault: testOnly('http://localhost:*'),
    }),
    API_KEY: str({
      devDefault: testOnly('TEST_API_KEY'),
    }),
    SESSION_SECRET: str({
      devDefault: testOnly('TEST_SESSION_SECRET'),
    }),
  });
}

export const env = getEnv();
