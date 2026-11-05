import {createHmac} from 'node:crypto';
import request from 'supertest';
import {DataSource} from 'typeorm';
import {describe, expect, it, vi} from 'vitest';
import {TokenProvider} from '../../src/security/jwt/token.provider.js';
import {Containers, type StartedService} from '../support/containers.js';
import {SchemaCheck} from '../support/schema-check.js';
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
        // Migrations produced exactly the schema the entities describe.
        expect(
          await SchemaCheck.pendingChanges(
            application.beans.getBean(DataSource),
          ),
        ).toEqual([]);
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
            QUEUE_TYPE: 'bullmq',
            QUEUE_ATTEMPTS: '2',
            QUEUE_BACKOFF_MS: '10',
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

            // BullMQ: a failing job ends in the dead-letter queue.
            const auth = {authorization: `Bearer ${token}`};
            await request(app)
              .post('/api/v1/queues/demo/jobs')
              .set(auth)
              .send({fail: true});
            await vi.waitFor(
              async () => {
                const letters = (
                  await request(app)
                    .get('/api/v1/queues/demo/dead-letters')
                    .set(auth)
                ).body.data;
                expect(letters).toHaveLength(1);
                expect(letters[0].error).toBe('demo job asked to fail');
              },
              {timeout: 15_000, interval: 200},
            );
          } finally {
            await application.close();
          }
        },
      );
    },
  );
});
