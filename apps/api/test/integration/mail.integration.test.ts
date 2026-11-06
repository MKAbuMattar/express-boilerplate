import {TokenProvider} from '@express-boilerplate/common/security/jwt/token.provider.js';
import {MailService} from '@express-boilerplate/service/service/mail.service.js';
import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import type {Application} from '../../src/application.js';
import {TestApp} from '../support/test-app.js';

describe('Mail', () => {
  let application: Application;
  let app: express.Application;

  beforeAll(async () => {
    ({application, app} = await TestApp.create({QUEUE_BACKOFF_MS: '5'}));
  });
  afterAll(() => application.close());

  it('emails new users through the welcome-email queue', async () => {
    const send = vi
      .spyOn(application.beans.getBean(MailService), 'send')
      .mockResolvedValue();
    const token = await application.beans
      .getBean(TokenProvider)
      .createToken('m', TestApp.ALL_SCOPES);
    await request(app)
      .post('/api/v2/users')
      .auth(token, {type: 'bearer'})
      .send({name: 'Mia', email: 'mia@example.com', age: 30});
    await vi.waitFor(() => {
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({to: 'mia@example.com', subject: 'Welcome'}),
      );
    });
  });

  it('without SMTP_URL mail is only logged', async () => {
    const mail = application.beans.getBean(MailService);
    expect(mail.enabled).toBe(false);
  });
});
