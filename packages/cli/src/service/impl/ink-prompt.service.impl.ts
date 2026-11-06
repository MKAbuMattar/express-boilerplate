import {ConfirmInput, MultiSelect, Select, TextInput} from '@inkjs/ui';
import {Box, render} from 'ink';
import {createElement as h, type ReactElement} from 'react';
import {CliView} from '../../view/cli.view.ts';
import {type Choice, PromptService} from '../prompt.service.ts';

/** Prompts drawn with Ink: arrow keys, space to toggle, enter to answer. */
export class InkPromptServiceImpl extends PromptService {
  async text(
    question: string,
    fallback: string,
    validate?: (value: string) => string | null,
  ): Promise<string> {
    let error: string | null = null;
    for (;;) {
      const value = await this.ask<string>(question, (done) =>
        h(
          Box,
          {flexDirection: 'column'},
          h(TextInput, {
            placeholder: fallback,
            onSubmit: (answer: string) => done(answer.trim() || fallback),
          }),
          error ? CliView.error(error) : null,
        ),
      );
      error = validate?.(value) ?? null;
      if (!error) {
        this.answered(question, value);
        return value;
      }
    }
  }

  async select(question: string, choices: Choice[]): Promise<string> {
    const value = await this.ask<string>(question, (done) =>
      h(Select, {options: choices, onChange: done}),
    );
    const label = choices.find((c) => c.value === value)?.label ?? value;
    this.answered(question, label);
    return value;
  }

  async multiSelect(
    question: string,
    choices: Choice[],
    selected: string[],
  ): Promise<string[]> {
    const values = await this.ask<string[]>(
      `${question} (space to toggle, enter to accept)`,
      (done) =>
        h(MultiSelect, {
          options: choices,
          defaultValue: selected,
          visibleOptionCount: 12,
          onSubmit: done,
        }),
    );
    this.answered(question, values.join(', ') || 'none');
    return values;
  }

  async confirm(question: string, fallback: boolean): Promise<boolean> {
    const value = await this.ask<boolean>(`${question} (y/n)`, (done) =>
      h(ConfirmInput, {
        defaultChoice: fallback ? 'confirm' : 'cancel',
        onConfirm: () => done(true),
        onCancel: () => done(false),
      }),
    );
    this.answered(question, value ? 'yes' : 'no');
    return value;
  }

  /** Renders one question, resolves with its answer, then clears it. */
  private ask<T>(
    question: string,
    input: (done: (value: T) => void) => ReactElement,
  ): Promise<T> {
    return new Promise((resolve) => {
      const app = render(
        CliView.question(
          question,
          input((value) => {
            app.clear();
            app.unmount();
            resolve(value);
          }),
        ),
      );
    });
  }

  /** Leaves one line per answered question in the scrollback. */
  private answered(question: string, answer: string): void {
    render(CliView.answered(question, answer)).unmount();
  }
}
