import type {DeadLetter} from '../../model/dead-letter.js';

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

/**
 * Work queue with retries and a dead-letter queue (DLQ). A job is tried up
 * to QUEUE_ATTEMPTS times with exponential backoff; when every attempt fails
 * it moves to the queue's DLQ, where it can be listed and replayed.
 */
export abstract class QueueBroker {
  abstract readonly type: string;
  abstract start(): Promise<void>;
  abstract close(): Promise<void>;
  /** Registers the one handler for a queue. Call before jobs arrive. */
  abstract process(queue: string, handler: JobHandler): void;
  /** Returns the job id. */
  abstract enqueue(
    queue: string,
    payload: Record<string, unknown>,
  ): Promise<string>;
  abstract deadLetters(queue: string): Promise<DeadLetter[]>;
  /** Moves a dead letter back to its queue. Null when the id is unknown. */
  abstract replay(queue: string, deadLetterId: string): Promise<string | null>;
}
