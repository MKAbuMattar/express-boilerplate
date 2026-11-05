import {
  Bean,
  type BeanFactory,
  Configuration,
} from '@express-boilerplate/common/config/bean-factory.js';
import {ExperimentService} from '../service/experiment.service.js';
import {HealthService} from '../service/health.service.js';
import {ExperimentServiceImpl} from '../service/impl/experiment.service.impl.js';
import {HealthServiceImpl} from '../service/impl/health.service.impl.js';
import {MailServiceImpl} from '../service/impl/mail.service.impl.js';
import {NetworkServiceImpl} from '../service/impl/network.service.impl.js';
import {UserServiceImpl} from '../service/impl/user.service.impl.js';
import {MailService} from '../service/mail.service.js';
import {NetworkService} from '../service/network.service.js';
import {UserService} from '../service/user.service.js';

/** Business layer: service contracts (abstract classes) bound to their impls. */
@Configuration()
export class ServiceConfiguration {
  @Bean(ExperimentService)
  experimentService(beans: BeanFactory): ExperimentService {
    return beans.getBean(ExperimentServiceImpl);
  }

  @Bean(MailService)
  mailService(beans: BeanFactory): MailService {
    return beans.getBean(MailServiceImpl);
  }

  @Bean(HealthService)
  healthService(beans: BeanFactory): HealthService {
    return beans.getBean(HealthServiceImpl);
  }

  @Bean(NetworkService)
  networkService(beans: BeanFactory): NetworkService {
    return beans.getBean(NetworkServiceImpl);
  }

  @Bean(UserService)
  userService(beans: BeanFactory): UserService {
    return beans.getBean(UserServiceImpl);
  }
}
