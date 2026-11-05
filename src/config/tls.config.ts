import {readFileSync} from 'node:fs';
import type {ServerOptions} from 'node:https';
import type {AppConfig} from './app.config.js';

export class TlsConfig {
  static serverOptions(config: AppConfig): ServerOptions {
    const {TLS_KEY_FILE, TLS_CERT_FILE, TLS_CA_FILE} = config.env;
    return {
      key: readFileSync(TLS_KEY_FILE),
      cert: readFileSync(TLS_CERT_FILE),
      ca: readFileSync(TLS_CA_FILE),
      minVersion: 'TLSv1.2',
      // Ask every client for a cert but let the handshake pass without one,
      // so only routes behind MtlsGuard require it.
      requestCert: true,
      rejectUnauthorized: false,
    };
  }
}
