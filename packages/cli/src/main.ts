#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {CliConfiguration} from './config/cli.configuration.ts';
import {CliConstants} from './constant/cli.constants.ts';
import {CompletionCommand} from './controller/completion.command.ts';
import {Invocation} from './model/invocation.ts';

export class Main {
  /** True when nothing on the command line answers a create question. */
  static noCreateFlags(values: Record<string, unknown>): boolean {
    return [
      'preset',
      'features',
      'config',
      'name',
      'yes',
      'dry-run',
      'install',
    ].every((flag) => values[flag] === undefined);
  }

  static async run(argv: string[]): Promise<void> {
    const {values, positionals} = parseArgs({
      args: argv,
      allowPositionals: true,
      allowNegative: true,
      options: {
        preset: {type: 'string'},
        features: {type: 'string'},
        config: {type: 'string'},
        name: {type: 'string'},
        template: {type: 'string'},
        ref: {type: 'string'},
        fields: {type: 'string'},
        values: {type: 'string'},
        status: {type: 'string'},
        type: {type: 'string'},
        auth: {type: 'string'},
        method: {type: 'string'},
        path: {type: 'string'},
        scope: {type: 'string'},
        action: {type: 'string'},
        public: {type: 'boolean'},
        install: {type: 'boolean'},
        'skip-tests': {type: 'boolean'},
        json: {type: 'boolean'},
        yes: {type: 'boolean', short: 'y'},
        'dry-run': {type: 'boolean', short: 'd'},
        force: {type: 'boolean', short: 'f'},
        migration: {type: 'boolean', short: 'm'},
        repository: {type: 'boolean', short: 'r'},
        help: {type: 'boolean', short: 'h'},
      },
    });
    if (values.help) return console.log(CliConstants.USAGE);

    // `create-express-boilerplate my-app` has no command word; with one
    // (npx create-express-boilerplate generate ...) it acts like `eb`.
    const [first, ...rest] = positionals;
    const bare = Invocation.isBareCreate(
      process.argv[1] ?? '',
      first,
      CompletionCommand.COMMANDS,
    );
    const command = bare ? 'create' : first;
    const args = bare ? positionals : rest;
    const cwd = process.cwd();
    const cli = new CliConfiguration();
    const dryRun = values['dry-run'];

    // No command in a terminal opens the app; with flags it stays a CLI.
    const tuiOptions = {template: values.template, ref: values.ref};
    if (cli.interactive && command === undefined) {
      return cli.tui.run(cli, cwd, tuiOptions);
    }
    if (
      cli.interactive &&
      bare &&
      args.length === 0 &&
      Main.noCreateFlags(values)
    ) {
      return cli.tui.run(cli, cwd, {...tuiOptions, start: 'create'});
    }

    switch (command) {
      case 'tui':
        return cli.tui.run(cli, cwd, tuiOptions);
      case 'create':
        return cli.create.run(args[0], {
          name: values.name,
          preset: values.preset,
          features: values.features?.split(','),
          install: values.install,
          config: values.config,
          template: values.template,
          ref: values.ref,
          yes: values.yes,
          dryRun,
        });
      case 'generate':
      case 'g':
        return cli.generate.run(args, cwd, {
          fields: values.fields,
          values: values.values,
          status: values.status,
          type: values.type,
          migration: values.migration,
          repository: values.repository,
          skipTests: values['skip-tests'],
          auth: values.auth,
          public: values.public,
          method: values.method,
          path: values.path,
          scope: values.scope,
          action: values.action,
          dryRun,
          force: values.force,
        });
      case 'add':
      case 'remove':
        return cli.features.change(command, args, cwd, {
          dryRun,
          install: values.install,
          template: values.template,
          ref: values.ref,
        });
      case 'features':
        return cli.features.list(values.template, values.ref);
      case 'info':
        return cli.info.run(cwd, Boolean(values.json));
      case 'doctor':
        return cli.doctor.run(cwd, Boolean(values.json));
      case 'routes':
        return cli.project.routes(cwd, Boolean(values.json));
      case 'migrate':
        return cli.project.migrate(args[0], cwd);
      case 'completion':
        return cli.completion.run(args[0]);
      default:
        console.log(CliConstants.USAGE);
        if (command) process.exitCode = 1;
    }
  }
}

await Main.run(process.argv.slice(2)).catch((error: unknown) => {
  console.error(
    `error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
