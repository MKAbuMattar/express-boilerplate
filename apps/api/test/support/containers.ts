import type express from 'express';
import request from 'supertest';
import {
  GenericContainer,
  getContainerRuntimeClient,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import {expect} from 'vitest';

export class StartedService {
  constructor(
    readonly container: StartedTestContainer,
    readonly url: string,
  ) {}

  stop(): Promise<unknown> {
    return this.container.stop();
  }
}

/** Real databases and caches in Docker. Tests skip when Docker is missing. */
export class Containers {
  static async dockerAvailable(): Promise<boolean> {
    try {
      await getContainerRuntimeClient();
      return true;
    } catch {
      return false;
    }
  }

  static async postgres(): Promise<StartedService> {
    const c = await new GenericContainer('postgres:18-alpine')
      .withEnvironment({
        POSTGRES_USER: 'app',
        POSTGRES_PASSWORD: 'app',
        POSTGRES_DB: 'app',
      })
      .withExposedPorts(5432)
      .withHealthCheck({
        // Over TCP: on first start the image runs a socket-only init server,
        // reports ready, then restarts it; a socket check races that restart.
        test: ['CMD-SHELL', 'pg_isready -h 127.0.0.1 -U app -d app'],
        interval: 1000,
        retries: 60,
      })
      .withWaitStrategy(Wait.forHealthCheck())
      .start();
    return new StartedService(
      c,
      `postgres://app:app@${c.getHost()}:${c.getMappedPort(5432)}/app`,
    );
  }

  static async mysql(image = 'mysql:9'): Promise<StartedService> {
    const c = await new GenericContainer(image)
      .withEnvironment({
        MYSQL_ROOT_PASSWORD: 'root',
        MYSQL_USER: 'app',
        MYSQL_PASSWORD: 'app',
        MYSQL_DATABASE: 'app',
      })
      .withExposedPorts(3306)
      .withHealthCheck({
        test: [
          'CMD',
          'mysqladmin',
          'ping',
          '-h',
          '127.0.0.1',
          '-uapp',
          '-papp',
        ],
        interval: 1000,
        retries: 120,
      })
      .withWaitStrategy(Wait.forHealthCheck())
      .start();
    return new StartedService(
      c,
      `mysql://app:app@${c.getHost()}:${c.getMappedPort(3306)}/app`,
    );
  }

  static async mariadb(): Promise<StartedService> {
    const c = await new GenericContainer('mariadb:12')
      .withEnvironment({
        MARIADB_ROOT_PASSWORD: 'root',
        MARIADB_USER: 'app',
        MARIADB_PASSWORD: 'app',
        MARIADB_DATABASE: 'app',
      })
      .withExposedPorts(3306)
      .withHealthCheck({
        test: ['CMD', 'healthcheck.sh', '--connect', '--innodb_initialized'],
        interval: 1000,
        retries: 120,
      })
      .withWaitStrategy(Wait.forHealthCheck())
      .start();
    return new StartedService(
      c,
      `mysql://app:app@${c.getHost()}:${c.getMappedPort(3306)}/app`,
    );
  }

  static async mongodb(): Promise<StartedService> {
    // No MONGO_INITDB_* user: the image then starts mongod once, with no
    // init-and-restart cycle, and the test database needs no auth.
    // MongoDB 8.0+ refuses to start on Linux kernel 6.19+ (SERVER-121912),
    // which CI runners use. 7.0 runs there and is still supported.
    const c = await new GenericContainer('mongo:7')
      .withExposedPorts(27017)
      // mongod logs JSON; show its errors (s: E) and fatals (s: F) in the test
      // output, so a container that dies says why.
      .withLogConsumer((stream) =>
        stream.on('data', (line: string | Buffer) => {
          if (/"s":"[EF]"/.test(String(line)))
            process.stderr.write(`mongo: ${line}`);
        }),
      )
      .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
      .withStartupTimeout(120_000)
      .start();
    return new StartedService(
      c,
      `mongodb://${c.getHost()}:${c.getMappedPort(27017)}/app`,
    );
  }

  static async redisProtocol(
    image: 'redis:8-alpine' | 'valkey/valkey:9-alpine',
  ): Promise<StartedService> {
    const cli = image.startsWith('valkey') ? 'valkey-cli' : 'redis-cli';
    const c = await new GenericContainer(image)
      .withExposedPorts(6379)
      .withHealthCheck({
        test: ['CMD', cli, 'ping'],
        interval: 1000,
        retries: 60,
      })
      .withWaitStrategy(Wait.forHealthCheck())
      .start();
    return new StartedService(
      c,
      `redis://${c.getHost()}:${c.getMappedPort(6379)}`,
    );
  }

  /** Same user lifecycle against whichever database the app is wired to. */
  static async userLifecycle(
    app: express.Application,
    token: string,
  ): Promise<void> {
    const email = `user-${Date.now()}@example.com`;
    const created = await request(app)
      .post('/api/users')
      .auth(token, {type: 'bearer'})
      .send({name: 'Container', email, age: 30});
    expect(created.status).toBe(201);
    const {id} = created.body.data;

    const duplicate = await request(app)
      .post('/api/users')
      .auth(token, {type: 'bearer'})
      .send({name: 'Container', email, age: 30});
    expect(duplicate.status).toBe(409);

    expect((await request(app).get(`/api/users/${id}`)).body.data.email).toBe(
      email,
    );
    const list = await request(app).get('/api/users');
    expect(list.body.data.map((u: {id: string}) => u.id)).toContain(id);

    expect(
      (
        await request(app)
          .delete(`/api/users/${id}`)
          .auth(token, {type: 'bearer'})
      ).status,
    ).toBe(204);
    expect((await request(app).get(`/api/users/${id}`)).status).toBe(404);
  }
}
