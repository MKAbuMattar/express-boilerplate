/** JSON message shape shared by WebSocket and TCP. */
export class TransportMessage {
  static readonly MAX_LINE_BYTES = 64 * 1024;

  constructor(
    readonly type: string,
    readonly payload: Record<string, unknown> = {},
  ) {}

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

  static encode(type: string, payload: Record<string, unknown> = {}): string {
    return JSON.stringify({type, ...payload});
  }
}
