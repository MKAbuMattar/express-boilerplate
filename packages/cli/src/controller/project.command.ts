import {execFile, spawn} from 'node:child_process';
import {promisify} from 'node:util';
import type {WorkspaceService} from '../service/workspace.service.ts';

/**
 * Commands that run the project's own scripts: `eb routes [--json]` and
 * `eb migrate [run|revert|show]`. Output streams straight through.
 */
export class ProjectCommand {
  private static readonly exec = promisify(execFile);
  private readonly workspace: WorkspaceService;

  constructor(workspace: WorkspaceService) {
    this.workspace = workspace;
  }

  routes(cwd: string, json: boolean): Promise<void> {
    const root = this.workspace.root(cwd);
    return ProjectCommand.pnpm(root, [
      '-C',
      'apps/api',
      'routes',
      ...(json ? ['--json'] : []),
    ]);
  }

  /** The route list as text, for the TUI. */
  async routeLines(cwd: string): Promise<string[]> {
    const {stdout} = await ProjectCommand.exec(
      'pnpm',
      ['-s', '-C', 'apps/api', 'routes'],
      {cwd: this.workspace.root(cwd), maxBuffer: 16 * 1024 * 1024},
    );
    return stdout.split('\n').filter((l) => /^[A-Z]+ +\//.test(l));
  }

  migrate(action: string | undefined, cwd: string): Promise<void> {
    const allowed = ['run', 'revert', 'show'];
    const step = action ?? 'run';
    if (!allowed.includes(step)) {
      throw new Error(
        `eb migrate ${allowed.join('|')}; new migrations: eb generate migration <name>`,
      );
    }
    return ProjectCommand.pnpm(this.workspace.root(cwd), [`migration:${step}`]);
  }

  private static pnpm(cwd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      spawn('pnpm', args, {cwd, stdio: 'inherit'}).on('exit', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`pnpm ${args.join(' ')} exited ${code}`)),
      );
    });
  }
}
