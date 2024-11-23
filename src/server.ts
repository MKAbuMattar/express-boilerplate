import {RegisterRoutes} from '@/api/__routes__/routes';
import {
  errorHandlers,
  notFoundHandler,
} from '@/middlewares/error-handler.middleware';
import requestLogger from '@/middlewares/request-logger.middleware';
import buildApiSpecAndRoutes from '@/scripts/tsoa.script';
import {env} from '@/utils/env-config.util';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, {type Express, type Request, type Response} from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

export const app: Express = express();

app.set('trust proxy', true);
app.use(compression());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({extended: true}));
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

if (env.isDevelopment) await buildApiSpecAndRoutes();

app.use(requestLogger);

// Routes
RegisterRoutes(app);

app.use('/', swaggerUi.serve, (_req: Request, res: Response) => {
  import('./api/__routes__/swagger.json').then((swaggerDocument) => {
    res.send(swaggerUi.generateHTML(swaggerDocument));
  });
});

// Not found handler
app.use(notFoundHandler);

// Error handlers
app.use(errorHandlers);

// Comments for code review
// TODO: [Devloper/QA Name] [Description]
// FIXME: [Devloper/QA Name] [Description]
// DEBUG: [Devloper/QA Name] [Description]
// REVIEW: [Devloper/QA Name] [Description]
// TESTED: [Devloper/QA Name] [Description]
// NOTE: [Devloper/QA Name] [Description]
// INFO: [Devloper/QA Name] [Description]
// DONE: [Devloper/QA Name] [Description]
