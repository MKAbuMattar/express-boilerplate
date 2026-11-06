import type {AppliedFile, Plan} from '../model/plan.ts';

/** Contract for reading and writing inside a generated project. */
export abstract class WorkspaceService {
  /** The project root at or above cwd; throws outside a project. */
  abstract root(cwd: string): string;
  /** The package scope, such as @my-api. */
  abstract scope(root: string): string;
  abstract exists(root: string, path: string): boolean;
  abstract read(root: string, path: string): string;
  /** File names in an absolute directory; empty when it does not exist. */
  abstract list(dir: string): string[];
  /**
   * Applies every file of the plan, or none: edits are checked first, and
   * an existing file is overwritten only with force. A dry run writes
   * nothing and returns the same report.
   */
  abstract apply(
    root: string,
    plan: Plan,
    options: {dryRun: boolean; force: boolean},
  ): AppliedFile[];
  /** Formats the written files so they pass `pnpm lint`. */
  abstract format(root: string, paths: string[]): Promise<void>;
}
