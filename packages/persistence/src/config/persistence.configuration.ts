import {AppConfig} from '@express-boilerplate/common/config/app.config.js';
import {
  Bean,
  type BeanFactory,
  Configuration,
} from '@express-boilerplate/common/config/bean-factory.js';
import {DatabaseConfig, DataSource} from './database.config.js';

/** Data layer beans: the TypeORM DataSource. */
@Configuration()
export class PersistenceConfiguration {
  @Bean(DataSource)
  dataSource(beans: BeanFactory): DataSource {
    return DatabaseConfig.createDataSource(beans.getBean(AppConfig));
  }
}
