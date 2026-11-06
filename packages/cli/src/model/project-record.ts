import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {CliConstants} from '../constant/cli.constants.ts';

/** boilerplate.json in a created project: its name and chosen features. */
export class ProjectRecord {
  readonly name: string;
  readonly features: string[];

  constructor(name: string, features: string[]) {
    this.name = name;
    this.features = features;
  }

  /** Null in the template itself, which has no record. */
  static read(root: string): ProjectRecord | null {
    const file = join(root, CliConstants.RECORD_FILE);
    if (!existsSync(file)) return null;
    const {name, features} = JSON.parse(readFileSync(file, 'utf8')) as {
      name: string;
      features: string[];
    };
    return new ProjectRecord(name, features);
  }
}
