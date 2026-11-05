export class PingResult {
  constructor(
    readonly host: string,
    readonly reachable: boolean,
    readonly latencyMs: number | null,
  ) {}
}

/** Contract for network checks. Abstract class, so it exists at runtime as a DI token. */
export abstract class NetworkService {
  /** One ICMP echo. host must already be validated (PingRequestDto). */
  abstract ping(host: string): Promise<PingResult>;
}
