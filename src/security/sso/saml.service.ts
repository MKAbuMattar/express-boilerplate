import {SAML} from '@node-saml/node-saml';
import {inject} from 'inversify';
import {AppConfig} from '../../config/app.config.js';
import {Component} from '../../config/stereotypes.js';
import {ApiConstants} from '../../constant/api.constants.js';
import {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';
import {AuthException} from '../../exceptions/auth.exception.js';
import {Principal} from '../principal.js';

/** SAML 2.0 service provider (SP-initiated, HTTP-POST binding on the ACS). */
@Component()
export class SamlService {
  private saml?: SAML;

  constructor(@inject(AppConfig) private readonly config: AppConfig) {}

  createLoginUrl(): Promise<string> {
    return this.client().getAuthorizeUrlAsync('', undefined, {});
  }

  async handleAssertion(body: Record<string, string>): Promise<Principal> {
    const client = this.client();
    let profile: Awaited<
      ReturnType<SAML['validatePostResponseAsync']>
    >['profile'];
    try {
      ({profile} = await client.validatePostResponseAsync(body));
    } catch {
      // Unsigned, expired or malformed assertion: a failed login, not a 500.
      throw AuthException.unauthorized(AuthStrategy.Saml, 'invalid assertion');
    }
    if (!profile?.nameID) {
      throw AuthException.unauthorized(
        AuthStrategy.Saml,
        'assertion has no NameID',
      );
    }
    return new Principal(AuthStrategy.Saml, profile.nameID, {
      email: profile.email ?? profile.mail,
      issuer: profile.issuer,
    });
  }

  metadata(): string {
    return this.client().generateServiceProviderMetadata(null, null);
  }

  private client(): SAML {
    const {SAML_ENTRY_POINT, SAML_ISSUER, SAML_IDP_CERT, PUBLIC_URL} =
      this.config.env;
    if (!SAML_ENTRY_POINT || !SAML_ISSUER || !SAML_IDP_CERT) {
      throw AuthException.notConfigured(AuthStrategy.Saml);
    }
    this.saml ??= new SAML({
      entryPoint: SAML_ENTRY_POINT,
      issuer: SAML_ISSUER,
      callbackUrl: new URL(
        ApiConstants.AUTH + ApiConstants.AUTH_SAML_ACS,
        PUBLIC_URL,
      ).href,
      idpCert: SAML_IDP_CERT,
      audience: SAML_ISSUER,
      wantAssertionsSigned: true,
    });
    return this.saml;
  }
}
