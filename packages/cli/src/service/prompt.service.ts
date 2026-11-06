export type Choice = {label: string; value: string};

/** Contract for asking the user. Only called when the terminal is interactive. */
export abstract class PromptService {
  /** Free text; `validate` returns an error message, or null when valid. */
  abstract text(
    question: string,
    fallback: string,
    validate?: (value: string) => string | null,
  ): Promise<string>;
  abstract select(question: string, choices: Choice[]): Promise<string>;
  abstract multiSelect(
    question: string,
    choices: Choice[],
    selected: string[],
  ): Promise<string[]>;
  abstract confirm(question: string, fallback: boolean): Promise<boolean>;
}
