import {Spinner} from '@inkjs/ui';
import {Box} from 'ink';
import {Component, createElement as h, type ReactElement} from 'react';
import type {Task} from '../service/progress.service.ts';
import {CliView, type TaskState} from './cli.view.ts';

type Props = {
  tasks: Task[];
  onDone: (error: Error | null) => void;
};
type State = {states: TaskState[]};

/** Runs tasks one after another, with a spinner on the one running. */
export class Runner extends Component<Props, State> {
  override state: State = {
    states: this.props.tasks.map((): TaskState => 'pending'),
  };

  override async componentDidMount(): Promise<void> {
    for (const [i, task] of this.props.tasks.entries()) {
      this.mark(i, 'running');
      try {
        await task.run();
        this.mark(i, 'done');
      } catch (error) {
        this.mark(i, 'failed');
        this.props.onDone(error as Error);
        return;
      }
    }
    this.props.onDone(null);
  }

  private mark(index: number, state: TaskState): void {
    this.setState(({states}) => ({
      states: states.map((s, i) => (i === index ? state : s)),
    }));
  }

  override render(): ReactElement {
    return h(
      Box,
      {marginLeft: CliView.GUTTER},
      CliView.tasks(
        this.props.tasks.map((t, i) => ({
          title: t.title,
          state: this.state.states[i]!,
        })),
        (title) => h(Spinner, {label: title}),
      ),
    );
  }
}
