import {randomUUID} from 'node:crypto';
import {DeadLetter} from '../../model/dead-letter.js';
import {type JobHandler, QueueBroker} from './queue-broker.js';

/**
 * In-process queue for dev and tests, same retry and DLQ rules as BullMQ.
 * shortcut: jobs live in memory and are lost on restart; use
 * QUEUE_TYPE=bullmq for anything that must survive a deploy.
 */
export class MemoryQueueBroker extends QueueBroker {
  readonly type = 'memory';
  private readonly handlers = new Map<string, JobHandler>();
  private readonly dlq = new Map<string, Map<string, DeadLetter>>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private closed = false;

  constructor(
    private readonly attempts: number,
    private readonly backoffMs: number,
  ) {
    super();
  }

  async start(): Promise<void> {}

  async close(): Promise<void> {
    this.closed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  process(queue: string, handler: JobHandler): void {
    this.handlers.set(queue, handler);
  }

  async enqueue(
    queue: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const id = randomUUID();
    this.schedule(queue, id, payload, 1, 0);
    return id;
  }

  async deadLetters(queue: string): Promise<DeadLetter[]> {
    return [...(this.dlq.get(queue)?.values() ?? [])];
  }

  async replay(queue: string, deadLetterId: string): Promise<string | null> {
    const letter = this.dlq.get(queue)?.get(deadLetterId);
    if (!letter) return null;
    this.dlq.get(queue)!.delete(deadLetterId);
    return this.enqueue(queue, letter.payload);
  }

  private schedule(
    queue: string,
    id: string,
    payload: Record<string, unknown>,
    attempt: number,
    delayMs: number,
  ): void {
    if (this.closed) return;
    const timer = setTimeout(async () => {
      this.timers.delete(timer);
      const handler = this.handlers.get(queue);
      try {
        if (!handler) throw new Error(`no handler for queue "${queue}"`);
        await handler(payload);
      } catch (error) {
        if (attempt < this.attempts) {
          const backoff = this.backoffMs * 2 ** (attempt - 1);
          this.schedule(queue, id, payload, attempt + 1, backoff);
          return;
        }
        const letters = this.dlq.get(queue) ?? new Map<string, DeadLetter>();
        letters.set(
          id,
          new DeadLetter(
            id,
            queue,
            payload,
            error instanceof Error ? error.message : String(error),
            attempt,
            new Date().toISOString(),
          ),
        );
        this.dlq.set(queue, letters);
      }
    }, delayMs);
    this.timers.add(timer);
  }
}
