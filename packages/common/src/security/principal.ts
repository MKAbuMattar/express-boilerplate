import type {AuthStrategy} from '../enumeration/auth-strategy.enum.js';

/** The authenticated caller, set on the request by a guard. */
export class Principal {
  constructor(
    readonly strategy: AuthStrategy,
    readonly subject: string,
    readonly claims: Record<string, unknown> = {},
  ) {}
}

declare global {
  namespace Express {
    interface Request {
      principal?: Principal;
      rawBody?: Buffer;
    }
  }
}
