/** Waiting on something that may hang: a cache, a database, a health check. */
export class Timeouts {
  /** Settles like promise, or rejects with "<what> timed out after <ms> ms". */
  static within<R>(promise: Promise<R>, ms: number, what: string): Promise<R> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${what} timed out after ${ms} ms`)),
        ms,
      );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
}
