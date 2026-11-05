import {createHmac} from 'node:crypto';
import request from 'supertest';
import {describe, expect, it} from 'vitest';
import {TokenProvider} from '../../src/security/jwt/token.provider.js';
import {Containers, type StartedService} from '../support/containers.js';
import {TestApp} from '../support/test-app.js';

const docker = await Containers.dockerAvailable();

/** Integration against real servers. Skipped when Docker is not available. */
describe.skipIf(!docker)('Containers: real databases and caches', () => {
  const withService = async (
    start: () => Promise<StartedService>,
    run: (service: StartedService) => Promise<void>,
  ) => {
    const service = await start();
    try {
      await run(service);
    } finally {
      await service.stop();
    }
  };

  it.each([
    ['postgres', () => Containers.postgres()],
    ['mysql', () => Containers.mysql()],
    ['mariadb', () => Containers.mariadb()],
  ] as const)('%s: user lifecycle', async (dbType, start) => {
    await withService(start, async (db) => {
      const {application, app} = await TestApp.create({
        DB_TYPE: dbType,
        DB_URL: db.url,
      });
      try {
        const health = await request(app).get('/api/health');
        expect(health.body.data.database).toBe(dbType);
        const token = await application.beans
          .getBean(TokenProvider)
          .createToken('it');
        await Containers.userLifecycle(app, token);
      } finally {
        await application.close();
      }
    });
  });

  it.each([
    ['redis', 'redis:8-alpine'],
    ['valkey', 'valkey/valkey:9-alpine'],
  ] as const)(
    '%s: cache-aside and HMAC replay protection',
    async (_name, image) => {
      await withService(
        () => Containers.redisProtocol(image),
        async (cache) => {
          const {application, app} = await TestApp.create({
            CACHE_TYPE: 'redis',
            CACHE_URL: cache.url,
          });
          try {
            expect(
              (await request(app).get('/api/health')).body.data.cache,
            ).toBe('redis');
            const token = await application.beans
              .getBean(TokenProvider)
              .createToken('it');
            await Containers.userLifecycle(app, token);

            const ts = String(Math.floor(Date.now() / 1000));
            const body = '{}';
            const send = () =>
              request(app)
                .post('/api/secure/hmac')
                .set('content-type', 'application/json')
                .set('x-client-id', 'partner-a')
                .set('x-timestamp', ts)
                .set(
                  'x-signature',
                  createHmac('sha256', TestApp.HMAC_SECRET)
                    .update(`${ts}\nPOST\n/api/secure/hmac\n${body}`)
                    .digest('hex'),
                )
                .send(body);
            expect((await send()).status).toBe(200);
            expect((await send()).status).toBe(401);
          } finally {
            await application.close();
          }
        },
      );
    },
  );
});
