import {afterEach, describe, expect, it, vi} from 'vitest';
import {AppConfig} from '../../src/config/app.config.js';

describe('AppConfig', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // envalid reports problems by calling process.exit; turn that into a throw.
  const failsWith = (env: NodeJS.ProcessEnv) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    return () => new AppConfig(env);
  };

  it('splits CORS origins, HMAC clients and experiments', () => {
    const config = new AppConfig({
      NODE_ENV: 'test',
      CORS_ORIGINS: 'https://a.example, https://b.example',
      HMAC_CLIENTS: 'a:s1,b:s:with:colons',
      EXPERIMENTS: 'checkout:50, search:10',
    });
    expect(config.corsOrigins).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(config.hmacClients.get('b')).toBe('s:with:colons');
    expect([...config.experiments]).toEqual([
      ['checkout', 50],
      ['search', 10],
    ]);
  });

  it('uses dev defaults only when NODE_ENV is set and not production', () => {
    expect(new AppConfig({NODE_ENV: 'development'}).env.SESSION_SECRET).toMatch(
      /^dev-only/,
    );
    expect(failsWith({})).toThrow('exit 1');
    expect(failsWith({NODE_ENV: 'production'})).toThrow('exit 1');
  });

  it('rejects short secrets', () => {
    expect(failsWith({NODE_ENV: 'test', JWT_SECRET: 'short'})).toThrow(
      'exit 1',
    );
    expect(
      failsWith({NODE_ENV: 'production', SESSION_SECRET: 'short'}),
    ).toThrow('exit 1');
  });

  it('rejects malformed experiments', () => {
    expect(
      () => new AppConfig({NODE_ENV: 'test', EXPERIMENTS: 'x:101'}),
    ).toThrow('EXPERIMENTS');
    expect(() => new AppConfig({NODE_ENV: 'test', EXPERIMENTS: 'x'})).toThrow(
      'EXPERIMENTS',
    );
  });
});
