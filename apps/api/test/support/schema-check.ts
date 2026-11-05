import type {DataSource} from 'typeorm';

export class SchemaCheck {
  /** SQL TypeORM would still run to match the entities; empty means in sync. */
  static async pendingChanges(dataSource: DataSource): Promise<string[]> {
    const log = await dataSource.driver.createSchemaBuilder().log();
    return log.upQueries.map((query) => query.query);
  }
}
