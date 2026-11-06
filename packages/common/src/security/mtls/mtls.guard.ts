import {X509Certificate} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {TLSSocket} from 'node:tls';
import type {ExpressGuard} from '@inversifyjs/http-express';
import type {Request} from 'express';
import {inject} from 'inversify';
import {AppConfig} from '../../config/app.config.js';
import {Component} from '../../config/stereotypes.js';
import {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';
import {AuthException} from '../../exceptions/auth.exception.js';
import {Principal} from '../principal.js';

/**
 * Requires a client certificate signed by TLS_CA_FILE, presented either
 * directly on this TLS socket, or forwarded by the edge proxy (HTTP/3 setup).
 * Both need TLS_CLIENT_AUTH=require: with "none" no cert is ever requested.
 *
 * A forwarded certificate (MTLS_FORWARDED_HEADER, base64 DER) is trusted only
 * when this connection itself is the proxy, proven by the proxy's own client
 * certificate (CN = MTLS_TRUSTED_PROXY_CN). A client that reaches the app
 * directly and sets the header gets nothing for it. The forwarded certificate
 * is then checked in full: issuer signature, validity window, clientAuth use.
 */
@Component()
export class MtlsGuard implements ExpressGuard {
  private static readonly CLIENT_AUTH_OID = '1.3.6.1.5.5.7.3.2';
  private ca?: X509Certificate;

  constructor(@inject(AppConfig) private readonly config: AppConfig) {}

  activate(request: Request): boolean {
    const socket = request.socket;
    if (!(socket instanceof TLSSocket) || !socket.authorized) {
      throw MtlsGuard.denied('valid client certificate required');
    }
    const peer = socket.getPeerCertificate();
    const {MTLS_FORWARDED_HEADER, MTLS_TRUSTED_PROXY_CN} = this.config.env;
    // A trusted proxy speaks for the client in a header; anyone else is the
    // client.
    const proxied =
      MTLS_FORWARDED_HEADER && peer.subject.CN === MTLS_TRUSTED_PROXY_CN;
    const certificate = proxied
      ? this.verifyForwarded(request.header(MTLS_FORWARDED_HEADER))
      : null;
    const cn = certificate
      ? MtlsGuard.commonName(certificate.subject)
      : String(peer.subject.CN);
    request.principal = new Principal(AuthStrategy.Mtls, cn, {
      fingerprint256: (certificate ?? peer).fingerprint256,
      serialNumber: (certificate ?? peer).serialNumber,
      ...(proxied && {via: MTLS_TRUSTED_PROXY_CN}),
      scope: this.scopesFor(cn),
    });
    return true;
  }

  private verifyForwarded(header: string | undefined): X509Certificate {
    if (!header) throw MtlsGuard.denied('valid client certificate required');
    let certificate: X509Certificate;
    try {
      certificate = new X509Certificate(Buffer.from(header, 'base64'));
    } catch {
      throw MtlsGuard.denied('unreadable forwarded certificate');
    }
    const ca = this.caCertificate();
    const now = new Date();
    const valid =
      certificate.checkIssued(ca) &&
      certificate.verify(ca.publicKey) &&
      certificate.validFromDate <= now &&
      now <= certificate.validToDate &&
      (certificate.keyUsage ?? []).includes(MtlsGuard.CLIENT_AUTH_OID);
    if (!valid) throw MtlsGuard.denied('forwarded certificate not trusted');
    return certificate;
  }

  private scopesFor(commonName: string): string {
    return this.config.mtlsClientScopes.get(commonName) ?? '';
  }

  private caCertificate(): X509Certificate {
    this.ca ??= new X509Certificate(readFileSync(this.config.env.TLS_CA_FILE));
    return this.ca;
  }

  private static commonName(subject: string): string {
    return /(?:^|\n)CN=([^\n]*)/.exec(subject)?.[1] ?? '';
  }

  private static denied(reason: string) {
    return AuthException.unauthorized(AuthStrategy.Mtls, reason);
  }
}
