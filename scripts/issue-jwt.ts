import 'reflect-metadata';
import {AppConfig} from '../src/config/app.config.js';
import {TokenProvider} from '../src/security/jwt/token.provider.js';

/** Dev helper: pnpm jwt <subject> [expiresIn]. Needs JWT_SECRET in .env. */
export class IssueJwt {
  static async run(subject = 'dev-user', expiresIn = '1h'): Promise<void> {
    const token = await new TokenProvider(new AppConfig()).createToken(
      subject,
      {},
      expiresIn,
    );
    console.log(token);
  }
}

await IssueJwt.run(process.argv[2], process.argv[3]);
