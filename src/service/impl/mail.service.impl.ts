import {inject} from 'inversify';
import {createTransport, type Transporter} from 'nodemailer';
import {AppConfig} from '../../config/app.config.js';
import {Service} from '../../config/stereotypes.js';
import {AppLogger} from '../../util/app-logger.js';
import {type MailMessage, MailService} from '../mail.service.js';

/**
 * SMTP through nodemailer when SMTP_URL is set (smtp://, or smtps:// for
 * TLS), else the message is only logged, so dev and tests need no server.
 * Errors propagate: the queue retries the job and dead-letters it.
 */
@Service()
export class MailServiceImpl extends MailService {
  private readonly transport: Transporter | null;

  constructor(
    @inject(AppConfig) private readonly config: AppConfig,
    @inject(AppLogger) private readonly appLogger: AppLogger,
  ) {
    super();
    this.transport = config.env.SMTP_URL
      ? createTransport(config.env.SMTP_URL)
      : null;
  }

  get enabled(): boolean {
    return this.transport !== null;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transport) {
      this.appLogger.logger.info(
        {subject: message.subject},
        'SMTP_URL not set; email not sent',
      );
      return;
    }
    await this.transport.sendMail({
      from: this.config.env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}
