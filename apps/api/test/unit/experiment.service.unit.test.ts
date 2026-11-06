import {ExperimentVariant} from '@express-boilerplate/common/enumeration/experiment-variant.enum.js';
import {NotFoundException} from '@express-boilerplate/common/exceptions/domain.exception.js';
import {ExperimentServiceImpl} from '@express-boilerplate/service/service/impl/experiment.service.impl.js';
import {describe, expect, it} from 'vitest';
import {UnitFixtures} from '../support/unit-fixtures.js';

describe('ExperimentServiceImpl (A/B)', () => {
  const service = (experiments: string) =>
    new ExperimentServiceImpl(UnitFixtures.config({EXPERIMENTS: experiments}));
  const share = (svc: ExperimentServiceImpl, name: string, n = 20_000) => {
    let a = 0;
    for (let i = 0; i < n; i++) {
      if (svc.assign(name, `user-${i}`) === ExperimentVariant.A) a++;
    }
    return a / n;
  };

  it('splits 50/50 within 2 percentage points', () => {
    expect(share(service('checkout:50'), 'checkout')).toBeGreaterThan(0.48);
    expect(share(service('checkout:50'), 'checkout')).toBeLessThan(0.52);
  });

  it('honours an uneven split', () => {
    const ratio = share(service('search:10'), 'search');
    expect(ratio).toBeGreaterThan(0.08);
    expect(ratio).toBeLessThan(0.12);
  });

  it('gives everyone B at 0 and A at 100', () => {
    expect(share(service('off:0'), 'off', 2000)).toBe(0);
    expect(share(service('on:100'), 'on', 2000)).toBe(1);
  });

  it('is sticky: the same subject always gets the same variant', () => {
    const svc = service('checkout:50');
    const first = svc.assign('checkout', 'alice');
    for (let i = 0; i < 50; i++)
      expect(svc.assign('checkout', 'alice')).toBe(first);
    // A fresh instance (another server) agrees.
    expect(service('checkout:50').assign('checkout', 'alice')).toBe(first);
  });

  it('buckets experiments independently', () => {
    const svc = service('one:50,two:50');
    let same = 0;
    for (let i = 0; i < 10_000; i++) {
      if (svc.assign('one', `u${i}`) === svc.assign('two', `u${i}`)) same++;
    }
    expect(same / 10_000).toBeGreaterThan(0.47);
    expect(same / 10_000).toBeLessThan(0.53);
  });

  it('throws NotFoundException for an unknown experiment', () => {
    try {
      service('checkout:50').assign('missing', 'u');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
    }
  });
});
