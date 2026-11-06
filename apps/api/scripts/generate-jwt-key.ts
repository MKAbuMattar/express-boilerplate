import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {exportPKCS8, exportSPKI, generateKeyPair} from 'jose';

/**
 * New ES256 key pair for JWT_ALGORITHM=ES256: pnpm jwt:keygen [dir].
 * Writes jwt-<timestamp>.key (private, PKCS#8) and .pub (public, SPKI).
 */
export class JwtKeyGenerator {
  static async run(dir = 'certs'): Promise<void> {
    mkdirSync(dir, {recursive: true});
    const {privateKey, publicKey} = await generateKeyPair('ES256', {
      extractable: true,
    });
    const name = `jwt-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`;
    writeFileSync(join(dir, `${name}.key`), await exportPKCS8(privateKey), {
      mode: 0o600,
    });
    writeFileSync(join(dir, `${name}.pub`), await exportSPKI(publicKey));
    console.log(
      [
        `Wrote ${dir}/${name}.key and ${dir}/${name}.pub.`,
        `Set JWT_ALGORITHM=ES256 and JWT_PRIVATE_KEY_FILE=${dir}/${name}.key.`,
        'Rotating? Add the old .pub to JWT_PUBLIC_KEY_FILES until its tokens expire.',
      ].join('\n'),
    );
  }
}

await JwtKeyGenerator.run(process.argv[2]);
