import {describe, expect, it} from 'vitest';
import {ImportPruner} from '../../src/util/import-pruner.ts';

describe('ImportPruner', () => {
  it('counts a spread as a use and a property access as none', () => {
    const source = [
      "import {Spread} from './a.js';",
      "import {Prop} from './b.js';",
      'const x = {...Spread.options(), y: other.Prop};',
      '',
    ].join('\n');
    expect(ImportPruner.prune(`${source}// cut\n`)).toBe(
      [
        "import {Spread} from './a.js';",
        'const x = {...Spread.options(), y: other.Prop};',
        '// cut',
        '',
      ].join('\n'),
    );
  });

  it('drops unused names and empty statements, keeps the rest as is', () => {
    const source = [
      "import 'reflect-metadata';",
      "import express, {Router, json} from 'express';",
      "import type {Gone} from './gone.js';",
      'import {',
      '  Keep,',
      '  type Typed as Alias,',
      "} from './keep.js';",
      '',
      'express(); json(); new Keep(); let a: Alias;',
      '',
    ].join('\n');
    expect(ImportPruner.prune(source)).toBe(
      [
        "import 'reflect-metadata';",
        "import express, {json} from 'express';",
        'import {',
        '  Keep,',
        '  type Typed as Alias,',
        "} from './keep.js';",
        '',
        'express(); json(); new Keep(); let a: Alias;',
        '',
      ].join('\n'),
    );
  });
});
