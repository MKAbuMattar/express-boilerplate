import {type ConnectionOptions, type Job, Queue, Worker} from 'bullmq';
import {QueueConstants} from '../../constant/queue.constants.js';
import {DeadLetter} from '../../model/dead-letter.js';
import {type JobHandler, QueueBroker} from './queue-broker.js';

/**
 * BullMQ on Redis, Valkey or ElastiCache. Each queue has a sibling
 * "<queue>.dlq" queue with no worker: jobs that fail every attempt are copied
 * there with their error, so they stay visible until someone replays them.
 */
export class BullMqQueueBroker extends QueueBroker {
  readonly type = 'bullmq';
  private readonly connection: ConnectionOptions;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private readonly handlers = new Map<string, JobHandler>();

  constructor(
    url: string,
    private readonly attempts: number,
    private readonly backoffMs: number,
  ) {
    super();
    // BullMQ workers block on Redis, so commands must never time out.
    this.connection = {url, maxRetriesPerRequest: null};
  }

  async start(): Promise<void> {
    for (const [name, handler] of this.handlers) {
      const worker = new Worker(name, (job: Job) => handler(job.data), {
        connection: this.connection,
      });
      worker.on('failed', (job, error) => {
        if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
          void this.queue(QueueConstants.deadLetterQueue(name)).add(
            'dead-letter',
            {
              payload: job.data,
              error: error.message,
              attempts: job.attemptsMade,
              failedAt: new Date().toISOString(),
            },
            {jobId: String(job.id)},
          );
        }
      });
      this.workers.push(worker);
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }

  process(queue: string, handler: JobHandler): void {
    this.handlers.set(queue, handler);
  }

  async enqueue(
    queue: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const job = await this.queue(queue).add(queue, payload, {
      attempts: this.attempts,
      backoff: {type: 'exponential', delay: this.backoffMs},
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });
    return String(job.id);
  }

  async deadLetters(queue: string): Promise<DeadLetter[]> {
    const jobs = await this.queue(
      QueueConstants.deadLetterQueue(queue),
    ).getJobs(['waiting']);
    return jobs.map(
      (job) =>
        new DeadLetter(
          String(job.id),
          queue,
          job.data.payload,
          job.data.error,
          job.data.attempts,
          job.data.failedAt,
        ),
    );
  }

  async replay(queue: string, deadLetterId: string): Promise<string | null> {
    const dlq = this.queue(QueueConstants.deadLetterQueue(queue));
    const job = await dlq.getJob(deadLetterId);
    if (!job) return null;
    const id = await this.enqueue(queue, job.data.payload);
    await job.remove();
    return id;
  }

  private queue(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {connection: this.connection});
      this.queues.set(name, queue);
    }
    return queue;
  }
}
