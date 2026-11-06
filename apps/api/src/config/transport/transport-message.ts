import type {Principal} from '@express-boilerplate/common/security/principal.js';

/** JSON message shape shared by WebSocket and TCP. */
export class TransportMessage {
  static readonly MAX_LINE_BYTES = 64 * 1024;

  constructor(
    readonly type: string,
    readonly payload: Record<string, unknown>,
  ) {}

  /**
   * The replies every transport gives the same way. Ping needs no login;
   * the rest need a principal. Transport-specific types (TCP auth,
   * WebSocket broadcast) are handled before this.
   */
  static answer(
    message: TransportMessage | null,
    principal: Principal | null,
  ): string {
    if (!message) {
      return TransportMessage.encode('error', {error: 'invalid JSON message'});
    }
    if (message.type === 'ping') {
      return TransportMessage.encode('pong', {at: Date.now()});
    }
    if (!principal) {
      return TransportMessage.encode('error', {error: 'unauthorized'});
    }
    switch (message.type) {
      case 'echo':
        return TransportMessage.encode('echo', message.payload);
      case 'whoami':
        return TransportMessage.encode('whoami', {
          strategy: principal.strategy,
          subject: principal.subject,
        });
      default:
        return TransportMessage.encode('error', {
          error: `unknown type "${message.type}"`,
        });
    }
  }

  /** Parses untrusted input; null for anything that is not {type: string}. */
  static parse(raw: string): TransportMessage | null {
    try {
      const value: unknown = JSON.parse(raw);
      if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value) ||
        typeof (value as {type?: unknown}).type !== 'string'
      ) {
        return null;
      }
      const {type, ...payload} = value as {type: string};
      return new TransportMessage(type, payload);
    } catch {
      return null;
    }
  }

  static encode(type: string, payload: Record<string, unknown>): string {
    return JSON.stringify({type, ...payload});
  }
}
