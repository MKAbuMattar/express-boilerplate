import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import type {Application} from '../../src/application.js';
import {QueueBroker} from '../../src/config/queue/queue-broker.js';
import {TokenProvider} from '../../src/security/jwt/token.provider.js';
import {TestApp} from '../support/test-app.js';

describe('Queues and dead-letter queues', () => {
  let application: Application;
  let app: express.Application;
  let auth: {authorization: string};

  beforeAll(async () => {
    ({application, app} = await TestApp.create({
      QUEUE_ATTEMPTS: '3',
      QUEUE_BACKOFF_MS: '5',
    }));
    auth = {
      authorization: `Bearer ${await application.beans.getBean(TokenProvider).createToken('ops')}`,
    };
  });
  afterAll(() => application.close());

  const deadLetters = async (queue: string) =>
    (await request(app).get(`/api/v1/queues/${queue}/dead-letters`).set(auth))
      .body.data;

  it('requires a JWT', async () => {
    expect((await request(app).get('/api/v1/queues')).status).toBe(401);
  });

  it('runs a good job and leaves the DLQ empty', async () => {
    const accepted = await request(app)
      .post('/api/v1/queues/demo/jobs')
      .set(auth)
      .send({n: 1});
    expect(accepted.status).toBe(202);
    expect(accepted.body.data.jobId).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(await deadLetters('demo')).toEqual([]);
  });

  it('retries a failing job, then dead-letters it with the error', async () => {
    // The demo handler throws when the payload has fail: true.
    await request(app)
      .post('/api/v1/queues/demo/jobs')
      .set(auth)
      .send({fail: true, order: 42});
    await vi.waitFor(async () => {
      const letters = await deadLetters('demo');
      expect(letters).toHaveLength(1);
      expect(letters[0]).toMatchObject({
        queue: 'demo',
        payload: {fail: true, order: 42},
        error: 'demo job asked to fail',
        attempts: 3,
      });
    });
  });

  it('replays a dead letter back onto its queue', async () => {
    const [letter] = await deadLetters('demo');
    const replay = await request(app)
      .post(`/api/v1/queues/demo/dead-letters/${letter.id}/replay`)
      .set(auth);
    expect(replay.status).toBe(202);
    // It fails again (same payload) and lands back in the DLQ under a new id.
    await vi.waitFor(async () => {
      const letters = await deadLetters('demo');
      expect(letters).toHaveLength(1);
      expect(letters[0].id).not.toBe(letter.id);
    });
    expect(
      (
        await request(app)
          .post(`/api/v1/queues/demo/dead-letters/${letter.id}/replay`)
          .set(auth)
      ).status,
    ).toBe(404);
  });

  it('enqueues a welcome email when a user is created', async () => {
    const broker = application.beans.getBean(QueueBroker);
    const enqueue = vi.spyOn(broker, 'enqueue');
    const created = await request(app)
      .post('/api/v1/users')
      .set(auth)
      .send({name: 'Q', email: 'q@example.com', age: 1});
    expect(enqueue).toHaveBeenCalledWith('welcome-email', {
      userId: created.body.data.id,
    });
  });

  it('refuses unknown queues', async () => {
    expect(
      (await request(app).post('/api/v1/queues/nope/jobs').set(auth).send({}))
        .status,
    ).toBe(404);
  });
});
