import type {IncomingMessage, Server} from 'node:http';
import type {Duplex} from 'node:stream';
import {inject} from 'inversify';
import {WebSocket, WebSocketServer} from 'ws';
import {SecurityConstants} from '../../constant/security.constants.js';
import {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';
import {TokenProvider} from '../../security/jwt/token.provider.js';
import {Principal} from '../../security/principal.js';
import {SessionService} from '../../security/sso/session.service.js';
import {EventBus} from '../../service/event-bus.service.js';
import {AppLogger} from '../../util/app-logger.js';
import {AppConfig} from '../app.config.js';
import {Component} from '../stereotypes.js';
import {TransportMessage} from './transport-message.js';

/**
 * WebSocket on the HTTP(S) port at WS_PATH (wss:// when TLS is on).
 *
 * Auth, checked before the upgrade completes (bad auth gets HTTP 401):
 * - `Authorization: Bearer <jwt>` for servers,
 * - `?access_token=<jwt>` for browsers, which cannot set headers,
 * - the SSO session cookie, only from an allowed Origin (blocks cross-site
 *   WebSocket hijacking).
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
    @inject(SessionService) private readonly sessionService: SessionService,
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

  get clientCount(): number {
    return this.alive.size;
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
        const payload = await this.tokenProvider.validateToken(token);
        return new Principal(AuthStrategy.Jwt, payload.sub ?? '', payload);
      } catch {
        return null;
      }
    }
    const session = this.cookie(request, SecurityConstants.SESSION_COOKIE);
    if (session && this.isAllowedOrigin(request.headers.origin)) {
      return this.sessionService.readToken(session);
    }
    return null;
  }

  private isAllowedOrigin(origin: string | undefined): boolean {
    if (!origin) return false;
    return (
      origin === new URL(this.config.env.PUBLIC_URL).origin ||
      this.config.corsOrigins.includes(origin)
    );
  }

  private cookie(request: IncomingMessage, name: string): string | undefined {
    for (const part of (request.headers.cookie ?? '').split(';')) {
      const [key, ...value] = part.trim().split('=');
      if (key === name) return decodeURIComponent(value.join('='));
    }
    return undefined;
  }

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
    switch (message?.type) {
      case 'ping':
        return TransportMessage.encode('pong', {at: Date.now()});
      case 'echo':
        return TransportMessage.encode('echo', message.payload);
      case 'whoami':
        return TransportMessage.encode('whoami', {
          strategy: principal.strategy,
          subject: principal.subject,
        });
      case 'broadcast':
        this.broadcast(
          TransportMessage.encode('broadcast', {
            from: principal.subject,
            data: message.payload.data ?? null,
          }),
        );
        return TransportMessage.encode('ack', {type: 'broadcast'});
      default:
        return TransportMessage.encode('error', {
          error: message
            ? `unknown type "${message.type}"`
            : 'invalid JSON message',
        });
    }
  }

  private broadcast(data: string): void {
    for (const client of this.alive.keys()) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  }
}
