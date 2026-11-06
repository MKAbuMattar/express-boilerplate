import {existsSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {render} from 'ink-testing-library';
import {createElement as h} from 'react';
import {describe, expect, it} from 'vitest';
import {CliConfiguration} from '../../src/config/cli.configuration.ts';
import {CliConstants} from '../../src/constant/cli.constants.ts';
import {TuiApp} from '../../src/view/tui.app.ts';

/** The smallest tree WorkspaceService accepts as a project. */
class FixtureProject {
  static create(): string {
    const root = mkdtempSync(join(tmpdir(), 'eb-tui-'));
    for (const pkg of ['common', 'persistence']) {
      mkdirSync(join(root, 'packages', pkg), {recursive: true});
      writeFileSync(
        join(root, 'packages', pkg, 'package.json'),
        JSON.stringify({name: `@shop/${pkg}`}),
      );
    }
    writeFileSync(
      join(root, CliConstants.RECORD_FILE),
      JSON.stringify({name: 'shop', features: []}),
    );
    return root;
  }
}

describe('TuiApp', () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const DOWN = '\u001B[B';

  it('generates through menu, wizard, preview and confirm, then quits', async () => {
    const root = FixtureProject.create();
    let exited = false;
    const {stdin, lastFrame} = render(
      h(TuiApp, {
        cli: new CliConfiguration(),
        cwd: root,
        onExit: () => {
          exited = true;
        },
      }),
    );
    const press = async (key: string, ms = 120) => {
      stdin.write(key);
      await wait(ms);
    };
    await wait(200);
    expect(lastFrame()).toContain('What do you want to do?');
    await press('\r'); // Generate code
    const constant = Object.keys(CliConstants.GENERATORS).indexOf('constant');
    for (let i = 0; i < constant; i++) await press(DOWN, 40);
    await press('\r');
    await press('billing');
    await press('\r', 300);
    expect(lastFrame()).toContain(
      'packages/common/src/constant/billing.constants.ts',
    );
    expect(lastFrame()).toContain('Write these files?');
    await press('y', 1500);
    expect(
      existsSync(
        join(root, 'packages/common/src/constant/billing.constants.ts'),
      ),
    ).toBe(true);
    expect(lastFrame()).toContain('Generated constant billing');
    await press(DOWN);
    await press('\r');
    expect(exited).toBe(true);
  }, 20_000);

  it('offers only create outside a project', async () => {
    const {lastFrame} = render(
      h(TuiApp, {
        cli: new CliConfiguration(),
        cwd: mkdtempSync(join(tmpdir(), 'eb-empty-')),
        onExit: () => {},
      }),
    );
    await wait(200);
    expect(lastFrame()).toContain('Create a project');
    expect(lastFrame()).not.toContain('Generate code');
  });
});
