import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {createElement as h} from 'react';
import {describe, expect, it} from 'vitest';
import {CliView} from '../../src/view/cli.view.ts';

describe('CliView', () => {
  it('marks each task by its state', () => {
    const {lastFrame} = render(
      CliView.tasks(
        [
          {title: 'Copy', state: 'done'},
          {title: 'Install', state: 'running'},
          {title: 'Format', state: 'pending'},
        ],
        (title) => h(Text, null, `… ${title}`),
      ),
    );
    expect(lastFrame()).toBe('✔ Copy\n… Install\n○ Format');
  });

  it('boxes the summary', () => {
    const frame = render(
      CliView.summary('Created shop', ['cd shop']),
    ).lastFrame()!;
    expect(frame).toContain('Created shop');
    expect(frame).toContain('cd shop');
    expect(frame.split('\n').find((l) => l.startsWith('╭'))).toMatch(/^╭─+╮$/);
  });
});
