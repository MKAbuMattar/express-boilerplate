export class MailMessage {
  constructor(
    readonly to: string,
    readonly subject: string,
    readonly text: string,
  ) {}
}

/** Contract for outgoing email. Abstract class, so it exists at runtime as a DI token. */
export abstract class MailService {
  /** True when a real SMTP server is configured. */
  abstract readonly enabled: boolean;
  abstract send(message: MailMessage): Promise<void>;
}
