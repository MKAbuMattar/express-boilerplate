import dotenv from 'dotenv';
import {cleanEnv, host, port, str, testOnly} from 'envalid';

dotenv.config();

function getEnv() {
  return cleanEnv(process.env, {
    NODE_ENV: str({
      devDefault: testOnly('development'),
      choices: ['development', 'staging', 'production'],
    }),
    HOST: host({devDefault: testOnly('localhost')}),
    PORT: port({devDefault: testOnly(8080)}),
    CORS_WHITELIST: str({
      devDefault: testOnly('http://localhost:*'),
    }),
  });
}

export const env = getEnv();
