import {Container, type ServiceIdentifier} from 'inversify';

type BeanMethod = (beans: BeanFactory) => unknown;
type BeanDefinition = {token: ServiceIdentifier; method: string | symbol};
type BeanHolder = {[BeanDecorators.definitions]?: BeanDefinition[]};

export class BeanDecorators {
  static readonly definitions = Symbol('beanDefinitions');

  /**
   * Marks a method of a @Configuration class as a bean factory method.
   * The token is explicit because esbuild (tsx, vitest) emits no return type
   * metadata to infer it from.
   */
  static bean(token: ServiceIdentifier): MethodDecorator {
    return (target, method) => {
      const holder = target as BeanHolder;
      holder[BeanDecorators.definitions] = [
        ...(holder[BeanDecorators.definitions] ?? []),
        {token, method},
      ];
    };
  }

  /** Marks a class whose @Bean methods BeanFactory registers. */
  static configuration(): ClassDecorator {
    return () => {};
  }
}

export const Bean = BeanDecorators.bean;
export const Configuration = BeanDecorators.configuration;

/**
 * Bean factory over an Inversify container. Classes marked
 * @Component, @Service, @Repository or @Controller are autobound singletons;
 * @Bean methods register everything else (third-party objects, config).
 */
export class BeanFactory {
  readonly container = new Container({
    autobind: true,
    defaultScope: 'Singleton',
  });

  register(...configurations: object[]): this {
    for (const configuration of configurations) {
      const definitions =
        (configuration as BeanHolder)[BeanDecorators.definitions] ?? [];
      for (const {token, method} of definitions) {
        const factoryMethod = (
          configuration as Record<string | symbol, BeanMethod>
        )[method]!;
        this.container
          .bind(token)
          .toDynamicValue(() => factoryMethod.call(configuration, this))
          .inSingletonScope();
      }
    }
    return this;
  }

  registerInstance<T>(token: ServiceIdentifier<T>, instance: T): this {
    this.container.bind(token).toConstantValue(instance);
    return this;
  }

  getBean<T>(token: ServiceIdentifier<T>): T {
    return this.container.get(token);
  }
}
