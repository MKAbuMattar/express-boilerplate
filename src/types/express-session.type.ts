import 'express-session';

import {SessionData as ExpressSessionData} from '@/schemas/express-session.schema';

declare module 'express-session' {
  interface SessionData extends Partial<ExpressSessionData> {}
}
