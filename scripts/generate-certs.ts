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

  /**
   * Creates whatever is missing and keeps what exists, so a CA you already
   * trust in your OS stays valid. force: true regenerates everything.
   */
  generate(force = false): string[] {
    mkdirSync(this.dir, {recursive: true});
    const created: string[] = [];
    let regenerate = force;
    const missing = (name: string) =>
      regenerate || !existsSync(this.path(`${name}.crt`));
    if (missing('ca')) {
      this.createCa();
      regenerate = true; // a new CA invalidates every certificate it signed
      created.push('ca');
    }
    const leaves: [string, string, string[]][] = [
      [
        'server',
        'localhost',
        [
          'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
          'extendedKeyUsage=serverAuth',
        ],
      ],
      ['client', 'local-client', ['extendedKeyUsage=clientAuth']],
      // The edge proxy's identity towards the app (HTTP/3 setup, see compose).
      ['edge-proxy', 'edge-proxy', ['extendedKeyUsage=clientAuth']],
    ];
    for (const [name, commonName, extensions] of leaves) {
      if (missing(name)) {
        this.createSigned(name, commonName, extensions);
        created.push(name);
      }
    }
    return created;
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
  const dir = process.argv[2]?.startsWith('--')
    ? 'certs'
    : (process.argv[2] ?? 'certs');
  const created = new LocalCertificateGenerator(dir).generate(
    process.argv.includes('--force'),
  );
  console.log(
    created.length > 0
      ? `Wrote ${created.map((name) => `${dir}/${name}.{crt,key}`).join(', ')}. Trust ${dir}/ca.crt in your OS to avoid browser warnings.`
      : `${dir}/ is complete; pass --force to regenerate everything.`,
  );
}
