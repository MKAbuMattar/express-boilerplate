import {describe, expect, it} from 'vitest';
import {Invocation} from '../../src/model/invocation.ts';

const COMMANDS = ['create', 'generate', 'g', 'doctor'];

describe('Invocation.isBareCreate', () => {
  it('npx: the bin name says create', () => {
    expect(
      Invocation.isBareCreate(
        '/x/.bin/create-express-boilerplate',
        'my-api',
        COMMANDS,
      ),
    ).toBe(true);
    expect(
      Invocation.isBareCreate(
        '/x/.bin/create-express-boilerplate',
        undefined,
        COMMANDS,
      ),
    ).toBe(true);
  });

  it('pnpm dlx / pnpm create: argv[1] is the bundle, a bare word means create', () => {
    expect(
      Invocation.isBareCreate(
        '/store/create-express-boilerplate/dist/main.js',
        'my-api',
        COMMANDS,
      ),
    ).toBe(true);
  });

  it('a command word is always that command', () => {
    expect(
      Invocation.isBareCreate(
        '/store/create-express-boilerplate/dist/main.js',
        'doctor',
        COMMANDS,
      ),
    ).toBe(false);
    expect(
      Invocation.isBareCreate(
        '/x/.bin/create-express-boilerplate',
        'g',
        COMMANDS,
      ),
    ).toBe(false);
  });

  it('the bundle with no word opens the app, not create', () => {
    expect(
      Invocation.isBareCreate('/store/dist/main.js', undefined, COMMANDS),
    ).toBe(false);
  });

  it('from a checkout an unknown word stays an error', () => {
    expect(
      Invocation.isBareCreate(
        '/repo/packages/cli/src/main.ts',
        'oops',
        COMMANDS,
      ),
    ).toBe(false);
    expect(
      Invocation.isBareCreate('/repo/node_modules/.bin/eb', 'oops', COMMANDS),
    ).toBe(false);
  });
});
