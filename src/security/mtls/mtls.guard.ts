import {TLSSocket} from 'node:tls';
import type {ExpressGuard} from '@inversifyjs/http-express';
import type {Request} from 'express';
import {Component} from '../../config/stereotypes.js';
import {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';
import {AuthException} from '../../exceptions/auth.exception.js';
import {Principal} from '../principal.js';

/**
 * Requires a client certificate signed by TLS_CA_FILE.
 * shortcut: checks the direct TLS socket only, so it fails behind a
 * TLS-terminating proxy; read the proxy's client-cert header when you add one.
 */
@Component()
export class MtlsGuard implements ExpressGuard {
  activate(request: Request): boolean {
    const socket = request.socket;
    if (!(socket instanceof TLSSocket) || !socket.authorized) {
      throw AuthException.unauthorized(
        AuthStrategy.Mtls,
        'valid client certificate required',
      );
    }
    const certificate = socket.getPeerCertificate();
    request.principal = new Principal(
      AuthStrategy.Mtls,
      String(certificate.subject.CN),
      {
        fingerprint256: certificate.fingerprint256,
        serialNumber: certificate.serialNumber,
      },
    );
    return true;
  }
}
