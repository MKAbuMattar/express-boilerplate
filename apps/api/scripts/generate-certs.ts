import {execFileSync} from 'node:child_process';
import {X509Certificate} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {hostname, userInfo} from 'node:os';
import {join} from 'node:path';

/**
 * Local CA + server cert (localhost and *.<domain>) + client cert for mTLS,
 * via the openssl CLI. For local dev and tests only; production certs come
 * from your CA or ACME and are mounted at TLS_*_FILE.
 *
 * You trust this CA in your browser, and its key sits on disk, so it is
 * name-constrained: it can only vouch for the local domain, localhost, etcd
 * and loopback addresses. A stolen ca.key cannot impersonate any other site.
 */
export class LocalCertificateGenerator {
  /** Every local server is https://<host>.express-boilerplate.len on 443. */
  static readonly DEFAULT_DOMAIN = 'express-boilerplate.len';
  /** Hosts on the public gateway, published on 127.0.0.1 (deploy/apisix/seed.mjs). */
  static readonly PUBLIC_HOSTS = [
    'api',
    // @feature:idp
    'keycloak',
    // @end:idp
  ];
  /** Hosts on the private gateway (operator tools), published on 127.0.0.2. */
  static readonly PRIVATE_HOSTS = [
    'dashboard',
    'dashboard-public',
    // @feature:vault
    'vault',
    // @end:vault
    // @feature:metrics
    'grafana',
    'prometheus',
    // @end:metrics
    // @feature:mail
    'mailpit',
    // @end:mail
  ];
  static readonly HOSTS = [
    ...LocalCertificateGenerator.PUBLIC_HOSTS,
    ...LocalCertificateGenerator.PRIVATE_HOSTS,
  ];
  /** Where compose publishes each gateway (PUBLIC_IP, PRIVATE_IP). */
  static readonly PUBLIC_IP = '127.0.0.1';
  static readonly PRIVATE_IP = '127.0.0.2';

  /**
   * Bumped when the certificates change shape; an older set is replaced as a
   * whole, CA included. 2: ECDSA, name-constrained CA, 397-day leaves.
   */
  static readonly FORMAT = '2';
  /** Leaves at most 397 days: the limit browsers and Apple platforms enforce. */
  static readonly LEAF_DAYS = 397;
  /** The CA lives long, so you trust it once; its leaves are reissued. */
  static readonly CA_DAYS = 3650;

  constructor(
    private readonly dir = 'certs',
    private readonly days = LocalCertificateGenerator.LEAF_DAYS,
    readonly domain = LocalCertificateGenerator.DEFAULT_DOMAIN,
  ) {}

  /** True when the certificates in dir were made by an older format. */
  outdated(): boolean {
    const file = this.path('FORMAT');
    return (
      existsSync(this.path('ca.crt')) &&
      (!existsSync(file) ||
        readFileSync(file, 'utf8').trim() !== LocalCertificateGenerator.FORMAT)
    );
  }

  /**
   * Creates whatever is missing and keeps what exists, so a CA you already
   * trust in your OS stays valid. force: true regenerates everything.
   */
  generate(force = false): string[] {
    mkdirSync(this.dir, {recursive: true});
    const created: string[] = [];
    let regenerate = force || this.outdated();
    const missing = (name: string) =>
      regenerate ||
      !existsSync(this.path(`${name}.crt`)) ||
      // An older server cert without the dev domain fails the TLS handshake.
      (name === 'server' && !this.serverCovers(`api.${this.domain}`));
    if (missing('ca')) {
      this.createCa();
      regenerate = true; // a new CA invalidates every certificate it signed
      created.push('ca');
    }
    const leaves: [string, string, string[]][] = [
      [
        'server',
        `api.${this.domain}`,
        [
          `subjectAltName=DNS:localhost,DNS:${this.domain},DNS:*.${this.domain},IP:127.0.0.1,IP:::1`,
          'extendedKeyUsage=serverAuth',
        ],
      ],
      ['client', 'local-client', ['extendedKeyUsage=clientAuth']],
      // A proxy whose forwarded X-Client-Cert the app trusts
      // (MTLS_TRUSTED_PROXY_CN). The APISIX gateway presents client.crt instead,
      // so nothing forwarded through it is trusted.
      ['edge-proxy', 'edge-proxy', ['extendedKeyUsage=clientAuth']],
      // etcd for the APISIX control plane, data plane and dashboard: TLS with
      // client certificates on every connection.
      [
        'etcd',
        'etcd',
        // clientAuth too: etcd's gRPC gateway (what the APISIX CLI writes
        // through) dials etcd itself with this cert, and client-cert-auth
        // refuses a cert that is not valid for clients.
        [
          'subjectAltName=DNS:etcd,DNS:localhost',
          'extendedKeyUsage=serverAuth,clientAuth',
        ],
      ],
      ['etcd-client', 'apisix', ['extendedKeyUsage=clientAuth']],
    ];
    for (const [name, commonName, extensions] of leaves) {
      if (missing(name)) {
        this.createSigned(name, commonName, extensions);
        created.push(name);
      }
    }
    writeFileSync(this.path('FORMAT'), `${LocalCertificateGenerator.FORMAT}\n`);
    return created;
  }

  /** True when the server cert is valid for host (wildcards included). */
  serverCovers(host: string): boolean {
    const file = this.path('server.crt');
    if (!existsSync(file)) return false;
    return (
      new X509Certificate(readFileSync(file)).checkHost(host) !== undefined
    );
  }

  /**
   * The /etc/hosts lines for the hosts that do not resolve yet, one per
   * gateway. /etc/hosts has no wildcards, so each name is listed.
   */
  async hostsHint(): Promise<string[]> {
    const lines: string[] = [];
    for (const [ip, hosts] of [
      [
        LocalCertificateGenerator.PUBLIC_IP,
        LocalCertificateGenerator.PUBLIC_HOSTS,
      ],
      [
        LocalCertificateGenerator.PRIVATE_IP,
        LocalCertificateGenerator.PRIVATE_HOSTS,
      ],
    ] as const) {
      const missing: string[] = [];
      for (const host of hosts) {
        const name = `${host}.${this.domain}`;
        await lookup(name).catch(() => missing.push(name));
      }
      if (missing.length > 0) lines.push(`${ip} ${missing.join(' ')}`);
    }
    return lines;
  }

  /** Names this CA may sign for; anything else fails verification. */
  private nameConstraints(): string {
    return [
      'nameConstraints=critical',
      `permitted;DNS:${this.domain}`,
      'permitted;DNS:localhost',
      'permitted;DNS:etcd',
      'permitted;IP:127.0.0.0/255.0.0.0',
      'permitted;IP:0:0:0:0:0:0:0:1/FFFF:FFFF:FFFF:FFFF:FFFF:FFFF:FFFF:FFFF',
    ].join(',');
  }

  private createCa(): void {
    // Which machine made it, so a trust store with several is readable.
    // CA_OWNER: set by compose, whose certs container has no useful user.
    let owner = process.env.CA_OWNER || 'local';
    try {
      if (!process.env.CA_OWNER) owner = `${userInfo().username}@${hostname()}`;
    } catch {
      // No user database in some containers: the generic name will do.
    }
    this.openssl(
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:P-384',
      '-nodes',
      '-sha384',
      '-days',
      String(LocalCertificateGenerator.CA_DAYS),
      '-subj',
      `/O=Express Boilerplate/OU=Local development/CN=Express Boilerplate Local CA (${owner})`,
      '-addext',
      'basicConstraints=critical,CA:TRUE,pathlen:0',
      '-addext',
      'keyUsage=critical,keyCertSign,cRLSign',
      '-addext',
      this.nameConstraints(),
      '-keyout',
      this.path('ca.key'),
      '-out',
      this.path('ca.crt'),
    );
  }

  private createSigned(name: string, commonName: string, extensions: string[]) {
    const extFile = this.path(`${name}.ext`);
    const always = [
      'basicConstraints=critical,CA:FALSE',
      // ECDSA keys sign the handshake; they never encrypt.
      'keyUsage=critical,digitalSignature',
      'subjectKeyIdentifier=hash',
      'authorityKeyIdentifier=keyid:always',
    ];
    writeFileSync(extFile, `${[...always, ...extensions].join('\n')}\n`);
    this.openssl(
      'req',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:P-256',
      '-nodes',
      '-sha256',
      '-subj',
      `/O=Express Boilerplate/OU=Local development/CN=${commonName}`,
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
  const generator = new LocalCertificateGenerator(
    dir,
    LocalCertificateGenerator.LEAF_DAYS,
    process.env.DEV_DOMAIN || LocalCertificateGenerator.DEFAULT_DOMAIN,
  );
  const replacing = generator.outdated();
  const created = generator.generate(process.argv.includes('--force'));
  if (replacing) {
    console.log(
      `Replaced older certificates in ${dir}/, CA included: trust the new ${dir}/ca.crt again (and remove the old one).`,
    );
  }
  console.log(
    created.length > 0
      ? `Wrote ${created.map((name) => `${dir}/${name}.{crt,key}`).join(', ')}. Trust ${dir}/ca.crt in your OS to avoid browser warnings.`
      : `${dir}/ is complete; pass --force to regenerate everything.`,
  );
  // In the compose certs container the lookup would test its DNS, not yours.
  const hint = process.env.CA_OWNER ? [] : await generator.hostsHint();
  console.log(
    process.env.CA_OWNER
      ? 'Add the hosts lines from `pnpm certs` on your machine if the names do not resolve.'
      : hint.length > 0
        ? `Some *.${generator.domain} names do not resolve yet. Add them once (public gateway, then private):\n  printf '${hint.join('\\n')}\\n' | sudo tee -a /etc/hosts`
        : `All local servers resolve: https://<name>.${generator.domain}`,
  );
}
