import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, {type Express} from 'express';
import helmet from 'helmet';

// API
import {healthCheckRouter} from '@/api/health-check/health-check.router';
import {userRouter} from '@/api/user/user.router';
// Docs
import {openAPIRouter} from '@/docs/openapi-router.doc';
// Middlewares
import authApiKey from '@/middlewares/auth-api-key.middleware';
import requestLogger from '@/middlewares/request-logger.middleware';
// Utils
import {env} from '@/utils/env-config.util';

export const app: Express = express();

app.set('trust proxy', true);
app.use(compression());
app.use(cookieParser());

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
app.use('/api/users', authApiKey(), userRouter);

// Docs
app.use('/docs', openAPIRouter);

// Comments for code review
// TODO: [Devloper/QA Name] [Description]
// FIXME: [Devloper/QA Name] [Description]
// DEBUG: [Devloper/QA Name] [Description]
// REVIEW: [Devloper/QA Name] [Description]
// TESTED: [Devloper/QA Name] [Description]
// NOTE: [Devloper/QA Name] [Description]
// INFO: [Devloper/QA Name] [Description]
// DONE: [Devloper/QA Name] [Description]
