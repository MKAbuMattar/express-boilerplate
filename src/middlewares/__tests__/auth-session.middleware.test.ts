import express, {Request, Response} from 'express';
import session from 'express-session';
import {StatusCodes} from 'http-status-codes';
import request from 'supertest';

// Middlewares
import authApiKey from '@/middlewares/auth-api-key.middleware';
import authSession from '@/middlewares/auth-session.middleware';
import errorHandler from '@/middlewares/error-handler.middleware';
import requestLogger from '@/middlewares/request-logger.middleware';
// Utils
import {env} from '@/utils/env-config.util';

describe('Auth Session Middleware', () => {
  const app = express();

  beforeAll(() => {
    app.use(requestLogger);

    app.use(
      session({
        secret: env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: {
          secure: false,
          httpOnly: true,
          maxAge: 24 * 60 * 60 * 1000,
        },
      }),
    );

    app.get('/login', authApiKey(), (req: Request, res: Response) => {
      // Simulate login and set session cookie
      req.session.user = {id: 'user-id', username: 'testuser'};
      res.status(StatusCodes.OK).send('Login route');
    });

    app.get(
      '/protected',
      authApiKey(),
      authSession(),
      (_req: Request, res: Response) => {
        res.status(StatusCodes.OK).send('Protected route');
      },
    );

    app.use(errorHandler());
  });

  describe('Handling session authentication', () => {
    it('returns 403 for requests without session', async () => {
      const response = await request(app)
        .get('/protected')
        .set('X-API-KEY', env.API_KEY);
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
    });

    it('returns 200 for requests with session', async () => {
      const agent = request.agent(app);

      const loginResponse = await agent
        .get('/login')
        .set('X-API-KEY', env.API_KEY);

      const sessionCookie = loginResponse.header['set-cookie'][0];

      const response = await agent
        .get('/protected')
        .set('X-API-KEY', env.API_KEY)
        .set('Cookie', `${sessionCookie}`);

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
