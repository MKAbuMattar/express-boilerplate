import {Box, Text} from 'ink';
import {createElement as h, type ReactElement} from 'react';

export type TaskState = 'pending' | 'running' | 'done' | 'failed';

/**
 * Ink elements the services render. Built with createElement, not JSX, so
 * Node runs this package from source with type stripping.
 */
export class CliView {
  static readonly MARKS: Record<Exclude<TaskState, 'running'>, string> = {
    pending: '○',
    done: '✔',
    failed: '✖',
  };

  /** Width of the left gutter that holds the step badges. */
  static readonly GUTTER = 9;

  /** A step label in the left gutter, like ` dir ` on a coloured background. */
  static badge(text: string, color = 'cyan'): ReactElement {
    return h(
      Box,
      {width: CliView.GUTTER, flexShrink: 0},
      h(
        Text,
        {backgroundColor: color, color: 'black', bold: true},
        ` ${text} `,
      ),
    );
  }

  /** One wizard line: badge, then the question or its answer. */
  static step(
    badge: string,
    body: ReactElement | string,
    color = 'cyan',
  ): ReactElement {
    return h(
      Box,
      {marginBottom: 1},
      CliView.badge(badge, color),
      typeof body === 'string' ? h(Text, null, body) : body,
    );
  }

  /** The app header: name badge plus a line about where you are. */
  static banner(title: string, subtitle: string): ReactElement {
    return h(
      Box,
      {flexDirection: 'column', marginBottom: 1},
      h(
        Box,
        null,
        CliView.badge('eb', 'magenta'),
        h(Text, {bold: true}, title),
      ),
      h(Box, {marginLeft: CliView.GUTTER}, h(Text, {dimColor: true}, subtitle)),
    );
  }

  static question(question: string, input: ReactElement): ReactElement {
    return h(
      Box,
      {flexDirection: 'column'},
      h(Text, {bold: true}, `? ${question}`),
      h(Box, {marginLeft: 2}, input),
    );
  }

  static error(message: string): ReactElement {
    return h(Text, {color: 'red'}, `  ${message}`);
  }

  static answered(question: string, answer: string): ReactElement {
    return h(
      Text,
      null,
      h(Text, {color: 'green'}, '✔ '),
      h(Text, {bold: true}, question),
      h(Text, {dimColor: true}, ` ${answer}`),
    );
  }

  static tasks(
    rows: {title: string; state: TaskState}[],
    spinner: (title: string) => ReactElement,
  ): ReactElement {
    return h(
      Box,
      {flexDirection: 'column'},
      ...rows.map((row, i) =>
        row.state === 'running'
          ? h(Box, {key: i}, spinner(row.title))
          : h(
              Text,
              {
                key: i,
                color:
                  row.state === 'done'
                    ? 'green'
                    : row.state === 'failed'
                      ? 'red'
                      : 'gray',
              },
              `${CliView.MARKS[row.state]} ${row.title}`,
            ),
      ),
    );
  }

  static summary(
    title: string,
    lines: string[],
    color = 'cyan',
    margin: 'marginTop' | 'marginBottom' = 'marginTop',
  ): ReactElement {
    return h(
      Box,
      {
        flexDirection: 'column',
        borderStyle: 'round',
        borderColor: color,
        paddingX: 1,
        [margin]: 1,
      },
      h(Text, {bold: true, color}, title),
      ...lines.map((line, i) => h(Text, {key: i}, line)),
    );
  }
}
