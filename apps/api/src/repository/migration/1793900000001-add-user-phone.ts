import {type MigrationInterface, type QueryRunner, TableColumn} from 'typeorm';

/** v2 schema change: optional phone number. API v1 keeps its old shape. */
export class AddUserPhone1793900000001 implements MigrationInterface {
  name = 'AddUserPhone1793900000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'phone',
        type: 'varchar',
        length: '32',
        isNullable: true,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'phone');
  }
}
