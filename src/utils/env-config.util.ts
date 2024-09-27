import dotenv from 'dotenv';
import {cleanEnv, host, port, str, testOnly} from 'envalid';

dotenv.config();

function getEnv() {
  return cleanEnv(process.env, {
    NODE_ENV: str({
      devDefault: testOnly('test'),
      choices: ['test', 'development', 'staging', 'production'],
      desc: 'The environment in which the application is running',
    }),
    HOST: host({
      devDefault: testOnly('localhost'),
      desc: 'The host on which the server will run',
    }),
    PORT: port({
      devDefault: testOnly(8080),
      desc: 'The port on which the server will run',
    }),
    CORS_WHITELIST: str({
      devDefault: testOnly('http://localhost:*'),
      desc: 'Comma-separated list of allowed origins for CORS',
    }),
    API_KEY: str({
      devDefault: testOnly('TEST_API_KEY'),
      desc: 'API key for authenticating requests',
    }),
  });
}

export const env = getEnv();
