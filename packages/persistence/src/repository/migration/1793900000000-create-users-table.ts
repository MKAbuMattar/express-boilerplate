import {type MigrationInterface, type QueryRunner, Table} from 'typeorm';
import {MigrationColumns} from './migration-columns.js';

/** v1 schema: the users table. */
export class CreateUsersTable1793900000000 implements MigrationInterface {
  name = 'CreateUsersTable1793900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {name: 'id', type: 'varchar', length: '36', isPrimary: true},
          {name: 'name', type: 'varchar', length: '120'},
          {name: 'email', type: 'varchar', length: '254'},
          {name: 'age', type: MigrationColumns.type(queryRunner, 'int')},
          MigrationColumns.createdAt(queryRunner),
          MigrationColumns.updatedAt(queryRunner),
        ],
        indices: [
          {name: 'UQ_users_email', columnNames: ['email'], isUnique: true},
        ],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users');
  }
}
