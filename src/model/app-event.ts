import {randomUUID} from 'node:crypto';

/** Something that happened, fanned out to SSE, WebSocket and queue consumers. */
export class AppEvent {
  readonly id = randomUUID();
  readonly at = new Date().toISOString();

  constructor(
    readonly type: string,
    /** Ids only, no personal data: events go to public SSE subscribers. */
    readonly data: Record<string, string | number | boolean>,
  ) {}
}
