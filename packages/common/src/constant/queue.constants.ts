export class QueueConstants {
  static readonly WELCOME_EMAIL = 'welcome-email';
  /** Fails when the payload has fail: true, to show the dead-letter flow. */
  static readonly DEMO = 'demo';
  /** Only these queues exist; the API refuses any other name. */
  static readonly NAMES: readonly string[] = [
    QueueConstants.WELCOME_EMAIL,
    QueueConstants.DEMO,
  ];

  static deadLetterQueue(queue: string): string {
    return `${queue}.dlq`;
  }
}
