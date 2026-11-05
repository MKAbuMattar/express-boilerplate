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
      // Client certificates are all or nothing at the handshake: "require"
      // refuses any connection without a cert signed by TLS_CA_FILE. Use it
      // when only a proxy (with its own client cert) and mTLS clients connect;
      // the proxy forwards end-user certs to MtlsGuard. "none" asks for no
      // cert, so mTLS routes answer 401.
      ...(config.env.TLS_CLIENT_AUTH === 'require' && {
        requestCert: true,
        rejectUnauthorized: true,
      }),
    };
  }
}
