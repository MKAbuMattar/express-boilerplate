import request from 'supertest';
import {describe, expect, it} from 'vitest';
import {Containers} from '../support/containers.js';

// UserEntity picks its id column from DB_TYPE at import time, so set it
// before importing the app. Vitest gives each file its own module graph.
process.env.DB_TYPE = 'mongodb';
const {TestApp} = await import('../support/test-app.js');
const {TokenProvider} = await import(
  '../../src/security/jwt/token.provider.js'
);

const docker = await Containers.dockerAvailable();

describe.skipIf(!docker)('Containers: MongoDB', () => {
  it('user lifecycle with ObjectId ids', async () => {
    const mongo = await Containers.mongodb();
    const {application, app} = await TestApp.create({
      DB_TYPE: 'mongodb',
      DB_URL: mongo.url,
    });
    try {
      expect((await request(app).get('/api/health')).body.data.database).toBe(
        'mongodb',
      );
      expect(
        (await request(app).get('/api/users/not-an-object-id')).status,
      ).toBe(404);
      const token = await application.beans
        .getBean(TokenProvider)
        .createToken('it');
      await Containers.userLifecycle(app, token);
    } finally {
      await application.close();
      await mongo.stop();
    }
  });
});
