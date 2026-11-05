import {isHttpResponse} from '@inversifyjs/http-core';
import {inject} from 'inversify';
import {QueueBroker} from '../config/queue/queue-broker.js';
import {Service} from '../config/stereotypes.js';
import {QueueConstants} from '../constant/queue.constants.js';
import {AppLogger} from '../util/app-logger.js';
import {EventBus} from './event-bus.service.js';
import {MailMessage, MailService} from './mail.service.js';
import {UserService} from './user.service.js';

/**
 * Wires queues to their handlers and to the events that feed them.
 * Add a queue: name it in QueueConstants, register its handler here.
 */
@Service()
export class JobRegistry {
  private unsubscribe?: () => void;

  constructor(
    @inject(QueueBroker) private readonly broker: QueueBroker,
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(AppLogger) private readonly appLogger: AppLogger,
    @inject(UserService) private readonly userService: UserService,
    @inject(MailService) private readonly mailService: MailService,
  ) {}

  async start(): Promise<void> {
    const {logger} = this.appLogger;

    // The queue carries only the user id; the address is read at send time.
    // A failed send throws, so the job is retried and then dead-lettered.
    this.broker.process(QueueConstants.WELCOME_EMAIL, async (payload) => {
      let user: {name: string; email: string};
      try {
        user = await this.userService.findById(String(payload.userId));
      } catch (error) {
        if (isHttpResponse(error) && error.statusCode === 404) return; // deleted since
        throw error;
      }
      await this.mailService.send(
        new MailMessage(
          user.email,
          'Welcome',
          `Hi ${user.name}, your account is ready.`,
        ),
      );
      logger.info({userId: payload.userId}, 'Welcome email sent');
    });

    this.broker.process(QueueConstants.DEMO, async (payload) => {
      if (payload.fail === true) throw new Error('demo job asked to fail');
      logger.info({payload}, 'Demo job done');
    });

    await this.broker.start();

    this.unsubscribe = this.eventBus.subscribe((event) => {
      if (event.type === 'user.created') {
        void this.broker
          .enqueue(QueueConstants.WELCOME_EMAIL, {userId: event.data.id})
          .catch((error: unknown) =>
            logger.error({err: error}, 'Could not enqueue welcome email'),
          );
      }
    });
  }

  async close(): Promise<void> {
    this.unsubscribe?.();
    await this.broker.close();
  }
}
