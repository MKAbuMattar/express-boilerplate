import type {QueryRunner, TableColumnOptions} from 'typeorm';

/**
 * Timestamp columns in the type each database driver uses for
 * @CreateDateColumn / @UpdateDateColumn, so one migration fits every dialect
 * and matches what the entity expects.
 */
export class MigrationColumns {
  /** The driver's own name for a type (sqlite stores `int` as `integer`). */
  static type(queryRunner: QueryRunner, type: string): string {
    return queryRunner.connection.driver.normalizeType({type: type as never});
  }

  static createdAt(queryRunner: QueryRunner): TableColumnOptions {
    const types = queryRunner.connection.driver.mappedDataTypes;
    return {
      name: 'createdAt',
      type: queryRunner.connection.driver.normalizeType({
        type: types.createDate,
      }),
      precision: types.createDatePrecision,
      default: types.createDateDefault,
    };
  }

  static updatedAt(queryRunner: QueryRunner): TableColumnOptions {
    const types = queryRunner.connection.driver.mappedDataTypes;
    return {
      name: 'updatedAt',
      type: queryRunner.connection.driver.normalizeType({
        type: types.updateDate,
      }),
      precision: types.updateDatePrecision,
      default: types.updateDateDefault,
    };
  }
}
