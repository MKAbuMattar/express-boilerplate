export class QueueConstants {
  // @feature:mail
  static readonly WELCOME_EMAIL = 'welcome-email';
  // @end:mail
  /** Fails when the payload has fail: true, to show the dead-letter flow. */
  static readonly DEMO = 'demo';
  /** Only these queues exist; the API refuses any other name. */
  static readonly NAMES: readonly string[] = [
    // @feature:mail
    QueueConstants.WELCOME_EMAIL,
    // @end:mail
    QueueConstants.DEMO,
  ];

  static deadLetterQueue(queue: string): string {
    return `${queue}.dlq`;
  }
}
