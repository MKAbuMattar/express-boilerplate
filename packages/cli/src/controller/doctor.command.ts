import {execFileSync} from 'node:child_process';
import {X509Certificate} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {CliConstants} from '../constant/cli.constants.ts';
import type {ProgressService} from '../service/progress.service.ts';
import type {WorkspaceService} from '../service/workspace.service.ts';

export type Check = {
  name: string;
  ok: boolean;
  required: boolean;
  detail: string;
};

/**
 * `eb doctor`: what `pnpm dev` needs on this machine. Exits 1 when a
 * required check fails; Docker is only needed for compose and container
 * tests, so it is a warning.
 */
export class DoctorCommand {
  private readonly workspace: WorkspaceService;
  private readonly progress: ProgressService;

  constructor(workspace: WorkspaceService, progress: ProgressService) {
    this.workspace = workspace;
    this.progress = progress;
  }

  async run(cwd: string, json: boolean): Promise<void> {
    const checks = await this.checks(cwd);
    if (json) {
      console.log(JSON.stringify(checks, null, 2));
    } else {
      this.progress.summary('Doctor', DoctorCommand.lines(checks));
    }
    if (checks.some((c) => c.required && !c.ok)) process.exitCode = 1;
  }

  static lines(checks: Check[]): string[] {
    return checks.map(
      (c) =>
        `${c.ok ? '✔' : c.required ? '✖' : '!'} ${c.name.padEnd(28)} ${c.ok ? '' : c.detail}`,
    );
  }

  /** Every check, for the CLI and the TUI alike. */
  async checks(cwd: string): Promise<Check[]> {
    const root = this.workspace.root(cwd);
    const name = this.workspace.exists(root, CliConstants.RECORD_FILE)
      ? (
          JSON.parse(this.workspace.read(root, CliConstants.RECORD_FILE)) as {
            name: string;
          }
        ).name
      : 'express-boilerplate';
    const host = `api.${name}.len`;
    const cert = join(root, 'apps/api/certs/server.crt');
    const node = Number(process.versions.node.split('.')[0]);

    const checks: Check[] = [
      {
        name: 'Node 26+',
        ok: node >= 26,
        required: true,
        detail: process.versions.node,
      },
      DoctorCommand.tool('pnpm', ['--version'], true),
      {
        name: 'Certificates',
        ok:
          existsSync(cert) &&
          new X509Certificate(readFileSync(cert)).checkHost(host) !== undefined,
        required: true,
        detail: existsSync(cert)
          ? `server.crt covers ${host}?`
          : 'run pnpm certs',
      },
      {
        name: `${host} resolves`,
        ok: await lookup(host).then(
          () => true,
          () => false,
        ),
        required: true,
        detail: `add to /etc/hosts: 127.0.0.1 ${host} (pnpm certs prints the line)`,
      },
      DoctorCommand.port443(),
      DoctorCommand.tool(
        'docker',
        ['info', '--format', '{{.ServerVersion}}'],
        false,
      ),
    ];
    return checks;
  }

  private static tool(
    command: string,
    args: string[],
    required: boolean,
  ): Check {
    try {
      const out = execFileSync(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return {name: command, ok: true, required, detail: out.trim()};
    } catch {
      return {
        name: command,
        ok: false,
        required,
        detail: `${command} not available`,
      };
    }
  }

  /** Linux lets non-root processes bind below 1024 only when this allows it. */
  private static port443(): Check {
    const file = '/proc/sys/net/ipv4/ip_unprivileged_port_start';
    const ok =
      process.platform !== 'linux' ||
      process.getuid?.() === 0 ||
      !existsSync(file) ||
      Number(readFileSync(file, 'utf8')) <= 443;
    return {
      name: 'Bind port 443',
      ok,
      required: true,
      detail: 'sudo sysctl -w net.ipv4.ip_unprivileged_port_start=443',
    };
  }
}
