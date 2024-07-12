import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, {Express} from 'express';
import session from 'express-session';
import helmet from 'helmet';
import {pino} from 'pino';

// API
import {authRouter} from '@/api/auth/auth.router';
import {healthCheckRouter} from '@/api/health-check/health-check.router';
import {userRouter} from '@/api/user/user.router';
// Docs
import {openAPIRouter} from '@/docs/openapi-router.doc';
// Middlewares
import authApiKey from '@/middlewares/auth-api-key.middleware';
import authSession from '@/middlewares/auth-session.middleware';
import requestLogger from '@/middlewares/request-logger.middleware';
// Utils
import {env} from '@/utils/env-config.util';

const logger = pino({name: 'server start'});
const app: Express = express();

app.set('trust proxy', true);
app.use(compression());
app.use(cookieParser());

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

app.use(
  cors({
    origin: env.CORS_WHITELIST,
    credentials: true,
  }),
);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'", "'unsafe-inline'"],
        baseUri: ["'self'"],
        blockAllMixedContent: [],
        fontSrc: ["'self'", 'https:', 'data:'],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        upgradeInsecureRequests: [],
      },
    },
  }),
);

app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(requestLogger);

// Routes
app.use('/health-check', healthCheckRouter);
app.use('/api/auth', authApiKey(), authRouter);
app.use('/api/users', authApiKey(), authSession(), userRouter);

// Docs
app.use('/docs', openAPIRouter);

export {app, logger};
