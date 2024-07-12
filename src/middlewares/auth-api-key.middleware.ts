import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import {StatusCodes} from 'http-status-codes';

// Utils
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
