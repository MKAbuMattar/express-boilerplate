import {execFile} from 'node:child_process';
import {isIPv6} from 'node:net';
import {AppConfig} from '@express-boilerplate/common/config/app.config.js';
import {Service} from '@express-boilerplate/common/config/stereotypes.js';
import {inject} from 'inversify';
import {NetworkService, PingResult} from '../network.service.js';

/**
 * ICMP echo through the OS `ping` binary: raw ICMP sockets need root, the
 * binary does not. execFile passes the host as one argument with no shell,
 * so nothing in it is ever interpreted.
 */
@Service()
export class NetworkServiceImpl extends NetworkService {
  private static readonly LATENCY = /time[=<]\s*([\d.]+)\s*ms/i;

  constructor(@inject(AppConfig) private readonly config: AppConfig) {
    super();
  }

  ping(host: string): Promise<PingResult> {
    const timeoutMs = this.config.env.PING_TIMEOUT_MS;
    const started = Date.now();
    return new Promise((resolve) => {
      execFile(
        'ping',
        NetworkServiceImpl.args(host, timeoutMs),
        {timeout: timeoutMs + 1000, windowsHide: true},
        (error, stdout) => {
          if (error) {
            resolve(new PingResult(host, false, null));
            return;
          }
          const match = NetworkServiceImpl.LATENCY.exec(stdout);
          // Localized ping output may not say "time="; fall back to wall time.
          const latency = match ? Number(match[1]) : Date.now() - started;
          resolve(new PingResult(host, true, latency));
        },
      );
    });
  }

  private static args(host: string, timeoutMs: number): string[] {
    if (process.platform === 'win32') {
      return ['-n', '1', '-w', String(timeoutMs), host];
    }
    const seconds = String(Math.max(1, Math.ceil(timeoutMs / 1000)));
    const family = isIPv6(host) ? ['-6'] : [];
    // `--` ends options, a second guard against a host read as a flag.
    return [...family, '-c', '1', '-W', seconds, '--', host];
  }
}
