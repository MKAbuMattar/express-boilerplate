import 'express-session';

import {SessionData as ExpressSessionData} from '@/schemas/express-session.schema';

declare module 'express-session' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface SessionData extends Partial<ExpressSessionData> {}
}
