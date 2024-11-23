import type {NextFunction, Request, RequestHandler, Response} from 'express';
import {StatusCodes} from 'http-status-codes';

import {env} from '@/utils/env-config.util';

const authenticateApiKey: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const apiKeyHeader = req.headers['x-api-key'];

  if (apiKeyHeader === env.API_KEY) {
    next();
  } else {
    res.sendStatus(StatusCodes.FORBIDDEN);
  }
};

export default () => authenticateApiKey;
