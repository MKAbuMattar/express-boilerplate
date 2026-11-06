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
    return MigrationColumns.timestamp(queryRunner, 'createdAt', 'create');
  }

  static updatedAt(queryRunner: QueryRunner): TableColumnOptions {
    return {
      ...MigrationColumns.timestamp(queryRunner, 'updatedAt', 'update'),
      // @feature:db-mysql
      // MySQL and MariaDB keep updatedAt current in the column itself, as
      // @UpdateDateColumn declares it there.
      ...(MigrationColumns.isMysql(queryRunner) && {
        onUpdate:
          queryRunner.connection.driver.mappedDataTypes.updateDateDefault,
      }),
      // @end:db-mysql
    };
  }

  private static timestamp(
    queryRunner: QueryRunner,
    name: string,
    kind: 'create' | 'update',
  ): TableColumnOptions {
    const types = queryRunner.connection.driver.mappedDataTypes;
    return {
      name,
      type: MigrationColumns.type(queryRunner, types[`${kind}Date`] as string),
      precision: types[`${kind}DatePrecision`],
      default: types[`${kind}DateDefault`],
    };
  }

  // @feature:db-mysql
  private static isMysql(queryRunner: QueryRunner): boolean {
    const {type} = queryRunner.connection.options;
    return type === 'mysql' || type === 'mariadb';
  }
  // @end:db-mysql
}
