import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import {StatusCodes} from 'http-status-codes';

// schemas
import {SessionDataSchema} from '@/schemas/express-session.schema';

const authenticateSession: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const parsed = SessionDataSchema.safeParse(req.session);

  if (parsed.success && parsed.data.user) {
    next();
  } else {
    res.sendStatus(StatusCodes.FORBIDDEN);
  }
};

export default () => authenticateSession;
