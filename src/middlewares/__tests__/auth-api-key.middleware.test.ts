import express, {Request, Response} from 'express';
import {StatusCodes} from 'http-status-codes';
import request from 'supertest';

// Middlewares
import authApiKey from '@/middlewares/auth-api-key.middleware';
import errorHandler from '@/middlewares/error-handler.middleware';
import requestLogger from '@/middlewares/request-logger.middleware';
// Utils
import {env} from '@/utils/env-config.util';

describe('Auth API Key Middleware', () => {
  const app = express();

  beforeAll(() => {
    app.use(requestLogger);

    app.get('/protected', authApiKey(), (_req: Request, res: Response) => {
      res.status(StatusCodes.OK).send('Protected route');
    });

    app.use(errorHandler());
  });

  describe('Handling API key authentication', () => {
    it('returns 403 for requests without API key', async () => {
      const response = await request(app).get('/protected');
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
    });

    it('returns 403 for requests with incorrect API key', async () => {
      const response = await request(app)
        .get('/protected')
        .set('X-API-KEY', 'wrong-key');
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
    });

    it('returns 200 for requests with correct API key', async () => {
      const response = await request(app)
        .get('/protected')
        .set('X-API-KEY', env.API_KEY);
      expect(response.status).toBe(StatusCodes.OK);
    });
  });

  describe('Handling unknown routes', () => {
    it('returns 404 for unknown routes', async () => {
      const response = await request(app).get('/this-route-does-not-exist');
      expect(response.status).toBe(StatusCodes.NOT_FOUND);
    });
  });
});
