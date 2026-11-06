import type {IncomingMessage, Server} from 'node:http';
import type {Duplex} from 'node:stream';
import {AppConfig} from '@express-boilerplate/common/config/app.config.js';
import {Component} from '@express-boilerplate/common/config/stereotypes.js';
import {SecurityConstants} from '@express-boilerplate/common/constant/security.constants.js';
import {TokenProvider} from '@express-boilerplate/common/security/jwt/token.provider.js';
import type {Principal} from '@express-boilerplate/common/security/principal.js';
import {SessionService} from '@express-boilerplate/common/security/sso/session.service.js';
import {AppLogger} from '@express-boilerplate/common/util/app-logger.js';
import {EventBus} from '@express-boilerplate/service/service/event-bus.service.js';
import {inject} from 'inversify';
import {WebSocket, WebSocketServer} from 'ws';
import {TransportMessage} from './transport-message.js';

/**
 * WebSocket on the HTTP(S) port at WS_PATH (wss:// when TLS is on).
 *
 * Auth, checked before the upgrade completes (bad auth gets HTTP 401):
 * - `Authorization: Bearer <jwt>` for servers,
 * - `?access_token=<jwt>` for browsers, which cannot set headers,
 // @feature:sso
 * - the SSO session cookie, only from an allowed Origin (blocks cross-site
 *   WebSocket hijacking).
 // @end:sso
 *
 * Messages are JSON {type, ...}: ping, echo, broadcast, whoami. Server events
 * from EventBus arrive as {type: "event", event}.
 */
@Component()
export class WebSocketGateway {
  static readonly HEARTBEAT_MS = 30_000;

  private server?: WebSocketServer;
  private heartbeat?: NodeJS.Timeout;
  private unsubscribe?: () => void;
  private readonly alive = new Map<WebSocket, boolean>();

  constructor(
    @inject(AppConfig) private readonly config: AppConfig,
    @inject(TokenProvider) private readonly tokenProvider: TokenProvider,
    // @feature:sso
    @inject(SessionService) private readonly sessionService: SessionService,
    // @end:sso
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(AppLogger) private readonly appLogger: AppLogger,
  ) {}

  attach(httpServer: Server): void {
    if (!this.config.env.WS_ENABLED) return;
    this.server = new WebSocketServer({
      noServer: true,
      maxPayload: this.config.env.WS_MAX_PAYLOAD_BYTES,
    });
    httpServer.on('upgrade', (request, socket, head) => {
      void this.upgrade(request, socket, head);
    });
    this.unsubscribe = this.eventBus.subscribe((event) =>
      this.broadcast(TransportMessage.encode('event', {event})),
    );
    // Drop clients that stopped answering pings (half-open connections).
    this.heartbeat = setInterval(() => {
      for (const [client, isAlive] of this.alive) {
        if (!isAlive) {
          client.terminate();
          this.alive.delete(client);
          continue;
        }
        this.alive.set(client, false);
        client.ping();
      }
    }, WebSocketGateway.HEARTBEAT_MS);
  }

  async close(): Promise<void> {
    clearInterval(this.heartbeat);
    this.unsubscribe?.();
    for (const client of this.alive.keys()) client.terminate();
    this.alive.clear();
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
  }

  private async upgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== this.config.env.WS_PATH || !this.server) {
      socket.destroy();
      return;
    }
    const principal = await this.authenticate(request, url);
    if (!principal) {
      socket.end(
        'HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Bearer\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
      );
      return;
    }
    this.server.handleUpgrade(request, socket, head, (client) =>
      this.onConnection(client, principal),
    );
  }

  private async authenticate(
    request: IncomingMessage,
    url: URL,
  ): Promise<Principal | null> {
    const [scheme, headerToken] = (request.headers.authorization ?? '').split(
      ' ',
    );
    const token =
      (scheme?.toLowerCase() === 'bearer' && headerToken) ||
      url.searchParams.get('access_token');
    if (token) {
      try {
        return await this.tokenProvider.authenticate(token);
      } catch {
        return null;
      }
    }
    // @feature:sso
    const session = this.cookie(request, SecurityConstants.SESSION_COOKIE);
    if (session && this.isAllowedOrigin(request.headers.origin)) {
      return this.sessionService.readToken(session);
    }
    // @end:sso
    return null;
  }

  // @feature:sso
  private isAllowedOrigin(origin: string | undefined): boolean {
    return origin !== undefined && this.config.allowedOrigins.has(origin);
  }
  // @end:sso

  // @feature:sso
  private cookie(request: IncomingMessage, name: string): string | undefined {
    for (const part of (request.headers.cookie ?? '').split(';')) {
      const [key, ...value] = part.trim().split('=');
      if (key === name) return decodeURIComponent(value.join('='));
    }
    return undefined;
  }
  // @end:sso

  private onConnection(client: WebSocket, principal: Principal): void {
    this.alive.set(client, true);
    client.on('pong', () => this.alive.set(client, true));
    client.on('close', () => this.alive.delete(client));
    client.on('error', (error) =>
      this.appLogger.logger.warn({err: error}, 'WebSocket client error'),
    );
    client.on('message', (data, isBinary) => {
      const message = isBinary ? null : TransportMessage.parse(String(data));
      client.send(this.reply(message, principal));
    });
    client.send(
      TransportMessage.encode('welcome', {subject: principal.subject}),
    );
  }

  private reply(
    message: TransportMessage | null,
    principal: Principal,
  ): string {
    if (message?.type !== 'broadcast') {
      return TransportMessage.answer(message, principal);
    }
    this.broadcast(
      TransportMessage.encode('broadcast', {
        from: principal.subject,
        data: message.payload.data ?? null,
      }),
    );
    return TransportMessage.encode('ack', {type: 'broadcast'});
  }

  private broadcast(data: string): void {
    for (const client of this.alive.keys()) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  }
}
