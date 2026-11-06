import {Spinner} from '@inkjs/ui';
import {render} from 'ink';
import {createElement as h} from 'react';
import {CliView, type TaskState} from '../../view/cli.view.ts';
import {ProgressService, type Task} from '../progress.service.ts';

/** Every step listed up front; a spinner on the one running. */
export class InkProgressServiceImpl extends ProgressService {
  async run(tasks: Task[]): Promise<void> {
    const rows = tasks.map((t) => ({
      title: t.title,
      state: 'pending' as TaskState,
    }));
    const draw = () =>
      CliView.tasks(rows, (title) => h(Spinner, {label: title}));
    const app = render(draw());
    try {
      for (const [i, task] of tasks.entries()) {
        rows[i]!.state = 'running';
        app.rerender(draw());
        try {
          await task.run();
          rows[i]!.state = 'done';
        } catch (error) {
          rows[i]!.state = 'failed';
          throw error;
        } finally {
          app.rerender(draw());
        }
      }
    } finally {
      app.unmount();
    }
  }

  summary(title: string, lines: string[]): void {
    render(CliView.summary(title, lines)).unmount();
  }
}
