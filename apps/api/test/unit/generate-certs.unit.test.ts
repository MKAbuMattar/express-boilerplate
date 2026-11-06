import {execFileSync} from 'node:child_process';
import {X509Certificate} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
import {LocalCertificateGenerator} from '../../scripts/generate-certs.js';

describe('LocalCertificateGenerator', () => {
  const dirs: string[] = [];
  const fresh = () => {
    const d = mkdtempSync(join(tmpdir(), 'certs-'));
    dirs.push(d);
    return d;
  };
  afterAll(() => {
    for (const d of dirs) rmSync(d, {recursive: true, force: true});
  });
  const cert = (g: LocalCertificateGenerator, name: string) =>
    new X509Certificate(
      readFileSync(join((g as unknown as {dir: string}).dir, `${name}.crt`)),
    );

  const dir = fresh();

  it('covers every *.express-boilerplate.len host and localhost', () => {
    const generator = new LocalCertificateGenerator(dir, 1);
    generator.generate();
    for (const host of LocalCertificateGenerator.HOSTS) {
      expect(generator.serverCovers(`${host}.express-boilerplate.len`)).toBe(
        true,
      );
    }
    expect(generator.serverCovers('localhost')).toBe(true);
    // A wildcard matches one label only.
    expect(generator.serverCovers('a.b.express-boilerplate.len')).toBe(false);
  });

  it('makes the etcd cert valid for its own gRPC gateway (client use too)', () => {
    new LocalCertificateGenerator(dir, 1).generate();
    const etcd = new X509Certificate(readFileSync(join(dir, 'etcd.crt')));
    // 1.3.6.1.5.5.7.3.1 serverAuth, 1.3.6.1.5.5.7.3.2 clientAuth
    expect(etcd.keyUsage).toEqual(
      expect.arrayContaining(['1.3.6.1.5.5.7.3.1', '1.3.6.1.5.5.7.3.2']),
    );
  });

  it('issues short-lived ECDSA leaves named for the API', () => {
    const generator = new LocalCertificateGenerator(fresh());
    generator.generate();
    const server = cert(generator, 'server');
    expect(server.publicKey.asymmetricKeyDetails?.namedCurve).toBe(
      'prime256v1',
    );
    expect(server.subject).toContain('CN=api.express-boilerplate.len');
    const days =
      (Date.parse(server.validTo) - Date.parse(server.validFrom)) / 86_400_000;
    expect(days).toBeLessThanOrEqual(397);
  });

  it('constrains the CA: it cannot vouch for any other site', () => {
    const dir = fresh();
    new LocalCertificateGenerator(dir, 1).generate();
    const sign = (name: string) => {
      const ext = join(dir, `${name}.ext`);
      writeFileSync(ext, `subjectAltName=DNS:${name}\n`);
      execFileSync(
        'openssl',
        [
          'req',
          '-newkey',
          'ec',
          '-pkeyopt',
          'ec_paramgen_curve:P-256',
          '-nodes',
          '-subj',
          `/CN=${name}`,
          '-keyout',
          join(dir, `${name}.key`),
          '-out',
          join(dir, `${name}.csr`),
        ],
        {stdio: 'pipe'},
      );
      execFileSync(
        'openssl',
        [
          'x509',
          '-req',
          '-in',
          join(dir, `${name}.csr`),
          '-CA',
          join(dir, 'ca.crt'),
          '-CAkey',
          join(dir, 'ca.key'),
          '-CAcreateserial',
          '-days',
          '1',
          '-extfile',
          ext,
          '-out',
          join(dir, `${name}.crt`),
        ],
        {stdio: 'pipe'},
      );
      try {
        execFileSync(
          'openssl',
          ['verify', '-CAfile', join(dir, 'ca.crt'), join(dir, `${name}.crt`)],
          {stdio: 'pipe'},
        );
        return 'trusted';
      } catch {
        return 'refused';
      }
    };
    expect(sign('grafana.express-boilerplate.len')).toBe('trusted');
    expect(sign('google.com')).toBe('refused');
  });

  it('replaces certificates made by an older format, CA included', () => {
    const dir = fresh();
    const generator = new LocalCertificateGenerator(dir, 1);
    generator.generate();
    const before = cert(generator, 'ca').fingerprint256;
    writeFileSync(join(dir, 'FORMAT'), '1\n');
    expect(generator.outdated()).toBe(true);
    expect(generator.generate()).toContain('ca');
    expect(cert(generator, 'ca').fingerprint256).not.toBe(before);
    expect(generator.outdated()).toBe(false);
  });

  it('reissues only the server cert when the domain changes', () => {
    const generator = new LocalCertificateGenerator(dir, 1, 'other.len');
    expect(generator.generate()).toEqual(['server']);
    expect(generator.serverCovers('api.other.len')).toBe(true);
  });
});
