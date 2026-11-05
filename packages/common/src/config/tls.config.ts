import {readFileSync} from 'node:fs';
import type {ServerOptions} from 'node:https';
import type {AppConfig} from './app.config.js';

export class TlsConfig {
  /**
   * Mozilla "intermediate" TLS 1.2 suites (forward secrecy, AEAD only).
   * TLS 1.3 suites are always on and not affected by this list.
   */
  static readonly CIPHERS = [
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305',
  ].join(':');

  /** ALPN id of the newline-delimited JSON protocol (TcpServer) on 443. */
  static readonly LINE_PROTOCOL = 'ndjson/1';

  static serverOptions(config: AppConfig): ServerOptions {
    const {TLS_KEY_FILE, TLS_CERT_FILE, TLS_CA_FILE} = config.env;
    return {
      key: readFileSync(TLS_KEY_FILE),
      cert: readFileSync(TLS_CERT_FILE),
      ca: readFileSync(TLS_CA_FILE),
      minVersion: 'TLSv1.2',
      ciphers: TlsConfig.CIPHERS,
      honorCipherOrder: true,
      // One port: HTTP/1.1 (and WebSocket upgrades), plus the TCP line
      // protocol only when it is on, so no client negotiates a dead protocol.
      ALPNProtocols: config.env.TCP_ENABLED
        ? ['http/1.1', TlsConfig.LINE_PROTOCOL]
        : ['http/1.1'],
      // Optional mTLS: ask every client for a cert, but let the handshake pass
      // without one so browsers and token clients still connect. A presented
      // cert is still verified against TLS_CA_FILE; socket.authorized is true
      // only when it chains, and MtlsGuard refuses the route otherwise. This
      // is not disabled certificate validation (CodeQL flags it anyway).
      requestCert: true,
      rejectUnauthorized: false,
    };
  }
}
