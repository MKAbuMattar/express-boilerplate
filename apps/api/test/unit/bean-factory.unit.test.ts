import {describe, expect, it, vi} from 'vitest';
import {
  Bean,
  BeanFactory,
  Configuration,
} from '../../src/config/bean-factory.js';
import {Service} from '../../src/config/stereotypes.js';

abstract class Clock {
  abstract now(): number;
}

class FixedClock extends Clock {
  now(): number {
    return 42;
  }
}

@Service()
class AutoBound {
  readonly id = Math.random();
}

describe('BeanFactory', () => {
  it('registers @Bean methods as lazy singletons', () => {
    const factoryMethod = vi.fn(() => new FixedClock());

    @Configuration()
    class ClockConfiguration {
      @Bean(Clock)
      clock(): Clock {
        return factoryMethod();
      }
    }

    const beans = new BeanFactory().register(new ClockConfiguration());
    expect(factoryMethod).not.toHaveBeenCalled();
    expect(beans.getBean(Clock).now()).toBe(42);
    expect(beans.getBean(Clock)).toBe(beans.getBean(Clock));
    expect(factoryMethod).toHaveBeenCalledTimes(1);
  });

  it('passes itself to bean methods so beans can depend on beans', () => {
    @Configuration()
    class Wiring {
      @Bean('greeting')
      greeting(beans: BeanFactory): string {
        return `now=${beans.getBean(Clock).now()}`;
      }
    }
    const beans = new BeanFactory()
      .registerInstance(Clock, new FixedClock())
      .register(new Wiring());
    expect(beans.getBean<string>('greeting')).toBe('now=42');
  });

  it('autobinds stereotype classes as singletons', () => {
    const beans = new BeanFactory();
    expect(beans.getBean(AutoBound)).toBe(beans.getBean(AutoBound));
  });
});
