import {render} from 'ink';
import {createElement as h} from 'react';
import type {CliConfiguration} from '../config/cli.configuration.ts';
import {TuiApp} from '../view/tui.app.ts';

/** `eb` with no command in a terminal: the full-screen app. */
export class TuiCommand {
  async run(
    cli: CliConfiguration,
    cwd: string,
    options: {
      start?: 'create';
      dir?: string;
      template?: string;
      ref?: string;
    },
  ): Promise<void> {
    if (!cli.interactive) {
      throw new Error('The app needs a terminal; use a command (eb --help)');
    }
    const app = render(
      h(TuiApp, {
        cli,
        cwd,
        start: options.start,
        dir: options.dir,
        template: options.template,
        ref: options.ref,
        onExit: () => app.unmount(),
      }),
    );
    await app.waitUntilExit();
  }
}
