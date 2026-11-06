import 'reflect-metadata';
import {ScopeConstants} from '@express-boilerplate/common/constant/scope.constants.js';
import {TokenProvider} from '@express-boilerplate/common/security/jwt/token.provider.js';
import {Application} from '../src/application.js';

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
    const tokens = new Application().beans.getBean(TokenProvider);
    const token = await tokens.createToken(subject, {scope}, expiresIn);
    console.log(token);
  }
}

await IssueJwt.run(process.argv[2], process.argv[3], process.argv[4]);
