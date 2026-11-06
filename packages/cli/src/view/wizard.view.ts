import {ConfirmInput, MultiSelect, Select, TextInput} from '@inkjs/ui';
import {Box, Text} from 'ink';
import {Component, createElement as h, type ReactElement} from 'react';
import type {Choice} from '../service/prompt.service.ts';
import {CliView} from './cli.view.ts';

export type Answer = string | string[] | boolean;
export type Answers = Record<string, Answer>;

/** One question of a wizard; `when` hides it, the option lists may depend on earlier answers. */
export type Step = {
  key: string;
  badge: string;
  label: string;
  kind: 'text' | 'select' | 'multi' | 'confirm';
  placeholder?: string;
  options?: (answers: Answers) => Choice[];
  selected?: (answers: Answers) => string[];
  validate?: (value: string, answers: Answers) => string | null;
  when?: (answers: Answers) => boolean;
  initial?: boolean;
};

type Props = {steps: Step[]; onDone: (answers: Answers) => void};
type State = {answers: Answers; error: string | null};

/**
 * Asks steps one at a time. Answered steps stay on screen next to their
 * badge, the way a launch checklist reads; the current one takes input.
 */
export class Wizard extends Component<Props, State> {
  override state: State = {answers: {}, error: null};

  private visible(answers: Answers): Step[] {
    return this.props.steps.filter((s) => s.when?.(answers) ?? true);
  }

  private current(answers: Answers): Step | undefined {
    return this.visible(answers).find((s) => !(s.key in answers));
  }

  private answer(step: Step, value: Answer): void {
    if (typeof value === 'string' && step.validate) {
      const error = step.validate(value, this.state.answers);
      if (error) {
        this.setState({error});
        return;
      }
    }
    const answers = {...this.state.answers, [step.key]: value};
    this.setState({answers, error: null}, () => {
      if (!this.current(answers)) this.props.onDone(answers);
    });
  }

  private static show(step: Step, value: Answer, answers: Answers): string {
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    const labels = new Map(
      (step.options?.(answers) ?? []).map((o) => [o.value, o.label.trim()]),
    );
    if (Array.isArray(value)) {
      return value.map((v) => labels.get(v) ?? v).join(', ') || 'none';
    }
    return labels.get(value) ?? (value || '(default)');
  }

  private input(step: Step): ReactElement {
    const {answers} = this.state;
    const done = (value: Answer) => this.answer(step, value);
    switch (step.kind) {
      case 'text':
        return h(TextInput, {
          key: step.key,
          placeholder: step.placeholder,
          onSubmit: (v: string) => done(v.trim() || (step.placeholder ?? '')),
        });
      case 'select':
        return h(Select, {
          key: step.key,
          options: step.options?.(answers) ?? [],
          visibleOptionCount: 10,
          onChange: done,
        });
      case 'multi':
        return h(MultiSelect, {
          key: step.key,
          options: step.options?.(answers) ?? [],
          defaultValue: step.selected?.(answers) ?? [],
          visibleOptionCount: 12,
          onSubmit: done,
        });
      case 'confirm':
        return h(ConfirmInput, {
          key: step.key,
          defaultChoice: step.initial === false ? 'cancel' : 'confirm',
          onConfirm: () => done(true),
          onCancel: () => done(false),
        });
    }
  }

  override render(): ReactElement {
    const {answers, error} = this.state;
    const current = this.current(answers);
    const hint =
      current?.kind === 'multi'
        ? ' (space to toggle, enter to accept)'
        : current?.kind === 'confirm'
          ? ' (y/n)'
          : '';
    return h(
      Box,
      {flexDirection: 'column'},
      ...this.visible(answers)
        .filter((s) => s.key in answers)
        .map((s) =>
          h(
            Box,
            {key: s.key},
            CliView.step(
              s.badge,
              h(
                Text,
                null,
                h(Text, {dimColor: true}, `${s.label} `),
                h(
                  Text,
                  {color: 'green'},
                  Wizard.show(s, answers[s.key]!, answers),
                ),
              ),
              'gray',
            ),
          ),
        ),
      current
        ? CliView.step(
            current.badge,
            h(
              Box,
              {flexDirection: 'column'},
              h(Text, {bold: true}, `${current.label}${hint}`),
              this.input(current),
              error ? h(Text, {color: 'red'}, error) : null,
            ),
          )
        : null,
    );
  }
}
