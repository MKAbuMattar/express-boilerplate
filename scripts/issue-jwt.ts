import 'reflect-metadata';
import {AppConfig} from '../src/config/app.config.js';
import {ScopeConstants} from '../src/constant/scope.constants.js';
import {TokenProvider} from '../src/security/jwt/token.provider.js';

/**
 * Dev helper: pnpm jwt <subject> [expiresIn] [scopes].
 * Scopes default to all of ScopeConstants.ALL. Needs JWT_SECRET in .env.
 */
export class IssueJwt {
  static async run(
    subject = 'dev-user',
    expiresIn = '1h',
    scope = ScopeConstants.ALL.join(' '),
  ): Promise<void> {
    const token = await new TokenProvider(new AppConfig()).createToken(
      subject,
      {scope},
      expiresIn,
    );
    console.log(token);
  }
}

await IssueJwt.run(process.argv[2], process.argv[3], process.argv[4]);
