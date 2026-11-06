export enum DatabaseType {
  Postgres = 'postgres',
  // @feature:db-mysql
  Mysql = 'mysql',
  Mariadb = 'mariadb',
  // @end:db-mysql
  // @feature:db-mongodb
  Mongodb = 'mongodb',
  // @end:db-mongodb
  // @feature:db-mssql
  Mssql = 'mssql',
  // @end:db-mssql
  Sqljs = 'sqljs',
}
