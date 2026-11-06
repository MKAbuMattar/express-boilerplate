import {execFileSync} from 'node:child_process';
import {CliConstants} from '../constant/cli.constants.ts';
import type {ProgressService} from '../service/progress.service.ts';
import type {WorkspaceService} from '../service/workspace.service.ts';

/** `eb info [--json]`: the project, its features and the toolchain. */
export class InfoCommand {
  private readonly workspace: WorkspaceService;
  private readonly progress: ProgressService;

  constructor(workspace: WorkspaceService, progress: ProgressService) {
    this.workspace = workspace;
    this.progress = progress;
  }

  run(cwd: string, json: boolean): void {
    const info = this.collect(cwd);
    if (json) {
      console.log(JSON.stringify(info, null, 2));
      return;
    }
    this.progress.summary(info.project as string, InfoCommand.lines(info));
  }

  static lines(info: Record<string, string | string[]>): string[] {
    return Object.entries(info)
      .filter(([key]) => key !== 'project')
      .map(
        ([key, value]) =>
          `${key.padEnd(10)} ${Array.isArray(value) ? value.join(', ') || 'core only' : value}`,
      );
  }

  /** The facts, for the CLI and the TUI alike. */
  collect(cwd: string): Record<string, string | string[]> {
    const root = this.workspace.root(cwd);
    const record = this.workspace.exists(root, CliConstants.RECORD_FILE)
      ? (JSON.parse(this.workspace.read(root, CliConstants.RECORD_FILE)) as {
          name: string;
          features: string[];
        })
      : {name: 'express-boilerplate (template)', features: ['all']};
    const pkg = (path: string) =>
      (
        JSON.parse(this.workspace.read(root, path)) as {
          dependencies?: Record<string, string>;
        }
      ).dependencies ?? {};
    const api = pkg('apps/api/package.json');
    const persistence = pkg('packages/persistence/package.json');
    const info = {
      project: record.name,
      root,
      scope: this.workspace.scope(root),
      domain: `https://api.${record.name.split(' ')[0]}.len`,
      features: record.features,
      node: process.versions.node,
      pnpm: InfoCommand.version('pnpm', ['--version']),
      docker: InfoCommand.version('docker', ['--version']),
      express: api.express ?? '',
      inversify: api.inversify ?? '',
      typeorm: persistence.typeorm ?? '',
    };
    return info;
  }

  private static version(command: string, args: string[]): string {
    try {
      return execFileSync(command, args, {encoding: 'utf8'}).trim();
    } catch {
      return 'not found';
    }
  }
}
