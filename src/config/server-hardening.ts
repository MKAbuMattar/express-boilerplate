import type {Server} from 'node:http';
import type {AppConfig} from './app.config.js';

/**
 * Socket-level limits for the HTTP(S) server: the defences against slow and
 * oversized requests (slowloris, header floods) that no middleware can give,
 * because they act before Express sees a request.
 */
export class ServerHardening {
  /** Node's default is 16 KB; stated so it is a decision, not an accident. */
  static readonly MAX_HEADER_BYTES = 16 * 1024;
  static readonly MAX_REQUESTS_PER_SOCKET = 1000;
  /**
   * How often Node enforces headersTimeout/requestTimeout. Its default is
   * 30 s, which would let a slowloris client hold a socket ~40 s, not 10.
   */
  static readonly CONNECTIONS_CHECK_MS = 1000;

  /** Options that only exist at server creation. */
  static readonly CREATE_OPTIONS = {
    maxHeaderSize: ServerHardening.MAX_HEADER_BYTES,
    connectionsCheckingInterval: ServerHardening.CONNECTIONS_CHECK_MS,
  };

  static apply(server: Server, config: AppConfig): Server {
    const {
      HTTP_HEADERS_TIMEOUT_MS,
      HTTP_REQUEST_TIMEOUT_MS,
      HTTP_KEEP_ALIVE_TIMEOUT_MS,
    } = config.env;
    // A client must finish sending headers in this time (slowloris).
    server.headersTimeout = HTTP_HEADERS_TIMEOUT_MS;
    // ...and the whole request, body included, in this time.
    server.requestTimeout = HTTP_REQUEST_TIMEOUT_MS;
    server.keepAliveTimeout = HTTP_KEEP_ALIVE_TIMEOUT_MS;
    // Spread long-lived keep-alive clients across instances over time.
    server.maxRequestsPerSocket = ServerHardening.MAX_REQUESTS_PER_SOCKET;
    return server;
  }
}
