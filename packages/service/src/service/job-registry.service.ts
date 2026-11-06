import {QueueBroker} from '@express-boilerplate/common/config/queue/queue-broker.js';
import {Service} from '@express-boilerplate/common/config/stereotypes.js';
import {QueueConstants} from '@express-boilerplate/common/constant/queue.constants.js';
import {NotFoundException} from '@express-boilerplate/common/exceptions/domain.exception.js';
import {AppLogger} from '@express-boilerplate/common/util/app-logger.js';
import {inject} from 'inversify';
import {EventBus} from './event-bus.service.js';
import {MailMessage, MailService} from './mail.service.js';
import {UserService} from './user.service.js';

/**
 * Wires queues to their handlers and to the events that feed them.
 * Add a queue: name it in QueueConstants, register its handler here.
 */
@Service()
export class JobRegistry {
  // @feature:mail
  private unsubscribe?: () => void;
  // @end:mail

  constructor(
    @inject(QueueBroker) private readonly broker: QueueBroker,
    // @feature:mail
    @inject(EventBus) private readonly eventBus: EventBus,
    // @end:mail
    @inject(AppLogger) private readonly appLogger: AppLogger,
    // @feature:mail
    @inject(UserService) private readonly userService: UserService,
    @inject(MailService) private readonly mailService: MailService,
    // @end:mail
  ) {}

  async start(): Promise<void> {
    const {logger} = this.appLogger;

    // @feature:mail
    // The queue carries only the user id; the address is read at send time.
    // A failed send throws, so the job is retried and then dead-lettered.
    this.broker.process(QueueConstants.WELCOME_EMAIL, async (payload) => {
      let user: {name: string; email: string};
      try {
        user = await this.userService.findById(String(payload.userId));
      } catch (error) {
        if (error instanceof NotFoundException) return; // deleted since
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
    // @end:mail

    this.broker.process(QueueConstants.DEMO, async (payload) => {
      if (payload.fail === true) throw new Error('demo job asked to fail');
      logger.info({payload}, 'Demo job done');
    });

    await this.broker.start();

    // @feature:mail
    this.unsubscribe = this.eventBus.subscribe((event) => {
      if (event.type === 'user.created') {
        void this.broker
          .enqueue(QueueConstants.WELCOME_EMAIL, {userId: event.data.id})
          .catch((error: unknown) =>
            logger.error({err: error}, 'Could not enqueue welcome email'),
          );
      }
    });
    // @end:mail
  }

  async close(): Promise<void> {
    // @feature:mail
    this.unsubscribe?.();
    // @end:mail
    await this.broker.close();
  }
}
