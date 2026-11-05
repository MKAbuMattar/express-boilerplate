import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

/**
 * Local CA + server cert (localhost) + client cert for mTLS, via the openssl
 * CLI. For local dev and tests only; production certs come from your CA or
 * ACME and are mounted at TLS_*_FILE.
 */
export class LocalCertificateGenerator {
  constructor(
    private readonly dir = 'certs',
    private readonly days = 825,
  ) {}

  generate(): string {
    mkdirSync(this.dir, {recursive: true});
    this.createCa();
    this.createSigned('server', 'localhost', [
      'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
      'extendedKeyUsage=serverAuth',
    ]);
    this.createSigned('client', 'local-client', [
      'extendedKeyUsage=clientAuth',
    ]);
    return this.dir;
  }

  private createCa(): void {
    this.openssl(
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-days',
      String(this.days),
      '-subj',
      '/CN=Express Boilerplate Local CA',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
      '-addext',
      'keyUsage=critical,keyCertSign,cRLSign',
      '-keyout',
      this.path('ca.key'),
      '-out',
      this.path('ca.crt'),
    );
  }

  private createSigned(name: string, commonName: string, extensions: string[]) {
    const extFile = this.path(`${name}.ext`);
    writeFileSync(extFile, `${extensions.join('\n')}\n`);
    this.openssl(
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-subj',
      `/CN=${commonName}`,
      '-keyout',
      this.path(`${name}.key`),
      '-out',
      this.path(`${name}.csr`),
    );
    this.openssl(
      'x509',
      '-req',
      '-sha256',
      '-days',
      String(this.days),
      '-in',
      this.path(`${name}.csr`),
      '-CA',
      this.path('ca.crt'),
      '-CAkey',
      this.path('ca.key'),
      '-CAcreateserial',
      '-extfile',
      extFile,
      '-out',
      this.path(`${name}.crt`),
    );
    rmSync(this.path(`${name}.csr`));
    rmSync(extFile);
  }

  private path(file: string): string {
    return join(this.dir, file);
  }

  private openssl(...args: string[]): void {
    execFileSync('openssl', args, {stdio: 'pipe'});
  }
}

if (import.meta.main) {
  const dir = process.argv[2] ?? 'certs';
  if (
    existsSync(join(dir, 'server.crt')) &&
    !process.argv.includes('--force')
  ) {
    console.log(`${dir}/server.crt exists; pass --force to regenerate`);
  } else {
    new LocalCertificateGenerator(dir).generate();
    console.log(
      `Wrote ${dir}/{ca,server,client}.{crt,key}. Trust ${dir}/ca.crt in your OS to avoid browser warnings.`,
    );
  }
}
