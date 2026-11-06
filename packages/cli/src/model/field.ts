import {CliConstants} from '../constant/cli.constants.ts';

export type FieldType = (typeof CliConstants.FIELD_TYPES)[number];

/** One column of a generated resource, besides id and the timestamps. */
export type Field = {name: string; type: FieldType};

export class Fields {
  /** "title:string,views:int" to fields; the type defaults to string. */
  static parse(spec: string): Field[] {
    const fields = spec
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name = '', type = 'string'] = part.split(':');
        if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) {
          throw new Error(`Field "${name}" must be camelCase`);
        }
        if (!(CliConstants.FIELD_TYPES as readonly string[]).includes(type)) {
          throw new Error(
            `Field "${name}": type must be ${CliConstants.FIELD_TYPES.join(', ')}`,
          );
        }
        if (CliConstants.RESERVED_FIELDS.includes(name)) {
          throw new Error(`Field "${name}" is added automatically`);
        }
        return {name, type: type as FieldType};
      });
    if (fields.length === 0) throw new Error('--fields needs at least one');
    return fields;
  }
}
