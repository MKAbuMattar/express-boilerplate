import net, {type AddressInfo, type Socket} from 'node:net';
import tls, {TLSSocket} from 'node:tls';
import {inject} from 'inversify';
import {AppConfig} from '../config/app.config.js';
import {Component} from '../config/stereotypes.js';
import {TlsConfig} from '../config/tls.config.js';
import {AuthStrategy} from '../enumeration/auth-strategy.enum.js';
import {TokenProvider} from '../security/jwt/token.provider.js';
import {Principal} from '../security/principal.js';
import {AppLogger} from '../util/app-logger.js';
import {TransportMessage} from './transport-message.js';

/**
 * Raw TCP (TLS when TLS_ENABLED) speaking newline-delimited JSON.
 * A client is authenticated by a valid mTLS client certificate, or by
 * sending {"type":"auth","token":"<jwt>"} first. Before that only ping works.
 * Lines over 64 KB and idle connections (60 s) are dropped.
 */
@Component()
export class TcpServer {
  static readonly IDLE_TIMEOUT_MS = 60_000;

  private server?: net.Server;
  private readonly sockets = new Set<Socket>();

  constructor(
    @inject(AppConfig) private readonly config: AppConfig,
    @inject(TokenProvider) private readonly tokenProvider: TokenProvider,
    @inject(AppLogger) private readonly appLogger: AppLogger,
  ) {}

  async start(port: number = this.config.env.TCP_PORT): Promise<void> {
    if (!this.config.env.TCP_ENABLED) return;
    const onSocket = (socket: Socket) => this.onSocket(socket);
    this.server = this.config.env.TLS_ENABLED
      ? tls.createServer(TlsConfig.serverOptions(this.config), onSocket)
      : net.createServer(onSocket);
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(port, this.config.env.HOST, resolve);
    });
  }

  get port(): number | undefined {
    return (this.server?.address() as AddressInfo | null)?.port;
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
  }

  private onSocket(socket: Socket): void {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', (error) =>
      this.appLogger.logger.debug({err: error}, 'TCP client error'),
    );
    socket.setTimeout(TcpServer.IDLE_TIMEOUT_MS, () => socket.destroy());
    socket.setEncoding('utf8');

    let principal: Principal | null = null;
    if (socket instanceof TLSSocket && socket.authorized) {
      principal = new Principal(
        AuthStrategy.Mtls,
        String(socket.getPeerCertificate().subject.CN),
      );
    }
    let buffer = '';
    let queue = Promise.resolve();
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > TransportMessage.MAX_LINE_BYTES) {
        socket.end(
          `${TransportMessage.encode('error', {error: 'line too long'})}\n`,
        );
        return;
      }
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (!line) continue;
        // Answer in order even when a reply is async (auth).
        queue = queue.then(async () => {
          const result = await this.reply(
            TransportMessage.parse(line),
            principal,
          );
          principal = result.principal;
          if (!socket.destroyed) socket.write(`${result.reply}\n`);
        });
      }
    });
  }

  private async reply(
    message: TransportMessage | null,
    principal: Principal | null,
  ): Promise<{reply: string; principal: Principal | null}> {
    const answer = (reply: string) => ({reply, principal});
    if (!message)
      return answer(
        TransportMessage.encode('error', {error: 'invalid JSON message'}),
      );
    if (message.type === 'ping')
      return answer(TransportMessage.encode('pong', {at: Date.now()}));
    if (message.type === 'auth') {
      try {
        const payload = await this.tokenProvider.validateToken(
          String(message.payload.token),
        );
        const authed = new Principal(
          AuthStrategy.Jwt,
          payload.sub ?? '',
          payload,
        );
        return {
          reply: TransportMessage.encode('authenticated', {
            subject: authed.subject,
          }),
          principal: authed,
        };
      } catch {
        return answer(
          TransportMessage.encode('error', {error: 'invalid token'}),
        );
      }
    }
    if (!principal)
      return answer(TransportMessage.encode('error', {error: 'unauthorized'}));
    switch (message.type) {
      case 'echo':
        return answer(TransportMessage.encode('echo', message.payload));
      case 'whoami':
        return answer(
          TransportMessage.encode('whoami', {
            strategy: principal.strategy,
            subject: principal.subject,
          }),
        );
      default:
        return answer(
          TransportMessage.encode('error', {
            error: `unknown type "${message.type}"`,
          }),
        );
    }
  }
}
