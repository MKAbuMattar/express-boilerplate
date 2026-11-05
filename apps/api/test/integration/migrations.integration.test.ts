import 'reflect-metadata';
import {AppConfig} from '@express-boilerplate/common/config/app.config.js';
import {DatabaseConfig} from '@express-boilerplate/persistence/config/database.config.js';
import {afterEach, describe, expect, it} from 'vitest';
import {SchemaCheck} from '../support/schema-check.js';

describe('Migrations', () => {
  const dataSource = DatabaseConfig.createDataSource(
    new AppConfig({
      NODE_ENV: 'test',
      DB_TYPE: 'sqljs',
      DB_MIGRATIONS_RUN: 'false',
    }),
  );
  afterEach(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  it('runs every migration in order and records it', async () => {
    await dataSource.initialize();
    const applied = await dataSource.runMigrations();
    expect(applied.map((m) => m.name)).toEqual([
      'CreateUsersTable1793900000000',
      'AddUserPhone1793900000001',
    ]);
    expect(await dataSource.showMigrations()).toBe(false); // nothing pending
  });

  it('leaves no difference between the migrated schema and the entities', async () => {
    await dataSource.initialize();
    await dataSource.runMigrations();
    expect(await SchemaCheck.pendingChanges(dataSource)).toEqual([]);
  });

  it('reverts cleanly: down() undoes up()', async () => {
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.undoLastMigration(); // drops phone
    const columns = (await dataSource
      .createQueryRunner()
      .getTable('users'))!.columns.map((c) => c.name);
    expect(columns).not.toContain('phone');
    await dataSource.undoLastMigration(); // drops users
    expect(await dataSource.createQueryRunner().hasTable('users')).toBe(false);
    await dataSource.runMigrations(); // and forward again
    expect(await SchemaCheck.pendingChanges(dataSource)).toEqual([]);
  });

  it('keeps old rows when the schema changes (phone is nullable)', async () => {
    await dataSource.initialize();
    const runner = dataSource.createQueryRunner();
    await dataSource.runMigrations({transaction: 'each'});
    await dataSource.undoLastMigration();
    await runner.query(
      `INSERT INTO users (id, name, email, age) VALUES ('00000000-0000-0000-0000-000000000001', 'Old', 'old@example.com', 50)`,
    );
    await dataSource.runMigrations();
    const [row] = await runner.query('SELECT name, phone FROM users');
    expect(row).toEqual({name: 'Old', phone: null});
  });
});
