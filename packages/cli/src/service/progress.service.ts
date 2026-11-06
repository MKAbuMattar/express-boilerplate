/** One step of a long command, shown while it runs. */
export type Task = {title: string; run: () => Promise<void> | void};

/** Contract for showing steps as they run. A failing step stops the rest. */
export abstract class ProgressService {
  abstract run(tasks: Task[]): Promise<void>;
  /** A closing message: what was done and what to do next. */
  abstract summary(title: string, lines: string[]): void;
}
