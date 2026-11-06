/** A job that failed every attempt, parked for inspection and replay. */
export class DeadLetter {
  constructor(
    readonly id: string,
    readonly queue: string,
    readonly payload: Record<string, unknown>,
    readonly error: string,
    readonly attempts: number,
    readonly failedAt: string,
  ) {}
}
