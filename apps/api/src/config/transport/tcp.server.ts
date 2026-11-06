import type tls from 'node:tls';
import type {TLSSocket} from 'node:tls';
import {AppConfig} from '@express-boilerplate/common/config/app.config.js';
import {Component} from '@express-boilerplate/common/config/stereotypes.js';
import {TlsConfig} from '@express-boilerplate/common/config/tls.config.js';
import {AuthStrategy} from '@express-boilerplate/common/enumeration/auth-strategy.enum.js';
import {TokenProvider} from '@express-boilerplate/common/security/jwt/token.provider.js';
import {Principal} from '@express-boilerplate/common/security/principal.js';
import {AppLogger} from '@express-boilerplate/common/util/app-logger.js';
import {inject} from 'inversify';
import {TransportMessage} from './transport-message.js';

/**
 * Newline-delimited JSON over TLS on the HTTPS port. A client selects it with
 * ALPN "ndjson/1" (TlsConfig.LINE_PROTOCOL); every other connection is HTTP.
 * A client is authenticated by a valid mTLS client certificate, or by
 * sending {"type":"auth","token":"<jwt>"} first. Before that only ping works.
 * Lines over 64 KB and idle connections (60 s) are dropped.
 */
@Component()
export class TcpServer {
  static readonly IDLE_TIMEOUT_MS = 60_000;

  private readonly sockets = new Set<TLSSocket>();

  constructor(
    @inject(AppConfig) private readonly config: AppConfig,
    @inject(TokenProvider) private readonly tokenProvider: TokenProvider,
    @inject(AppLogger) private readonly appLogger: AppLogger,
  ) {}

  /** Takes the ALPN ndjson/1 connections off the HTTPS server. */
  attach(server: tls.Server): void {
    if (!this.config.env.TCP_ENABLED) return;
    // https.Server handles 'secureConnection' as HTTP; put a dispatcher in
    // front of it so the line protocol never reaches the HTTP parser.
    const http = server.listeners('secureConnection') as ((
      socket: TLSSocket,
    ) => void)[];
    server.removeAllListeners('secureConnection');
    server.on('secureConnection', (socket: TLSSocket) => {
      if (socket.alpnProtocol === TlsConfig.LINE_PROTOCOL)
        this.onSocket(socket);
      else for (const listener of http) listener.call(server, socket);
    });
  }

  close(): void {
    for (const socket of this.sockets) socket.destroy();
  }

  private onSocket(socket: TLSSocket): void {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', (error) =>
      this.appLogger.logger.debug({err: error}, 'TCP client error'),
    );
    socket.setTimeout(TcpServer.IDLE_TIMEOUT_MS, () => socket.destroy());
    socket.setEncoding('utf8');

    let principal: Principal | null = null;
    // @feature:auth-mtls
    if (socket.authorized) {
      principal = new Principal(
        AuthStrategy.Mtls,
        String(socket.getPeerCertificate().subject.CN),
      );
    }
    // @end:auth-mtls
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
    if (message?.type === 'auth') {
      try {
        const authed = await this.tokenProvider.authenticate(
          String(message.payload.token),
        );
        return {
          reply: TransportMessage.encode('authenticated', {
            subject: authed.subject,
          }),
          principal: authed,
        };
      } catch {
        return {
          reply: TransportMessage.encode('error', {error: 'invalid token'}),
          principal,
        };
      }
    }
    return {reply: TransportMessage.answer(message, principal), principal};
  }
}
