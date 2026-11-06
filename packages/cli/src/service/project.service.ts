import type {CreateOptions} from '../model/create-options.ts';

/** Contract for writing a new project from the template. */
export abstract class ProjectService {
  /** Copies the template with only the enabled features into options.target. */
  abstract create(options: CreateOptions): void;
  /** Installs dependencies; the copied lockfile is pruned, not replaced. */
  abstract install(target: string): Promise<void>;
  /** Formats what cutting feature blocks left behind. */
  abstract format(target: string): Promise<void>;
}
