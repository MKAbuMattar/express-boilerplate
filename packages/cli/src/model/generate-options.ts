import type {AuthSpec} from './auth.ts';
import type {Field} from './field.ts';

/** What one `eb generate <kind> <name>` run was asked for. */
export type GenerateOptions = {
  name: string;
  fields: Field[];
  /** enum: its members. */
  values: string[];
  /** exception: the HTTP status the error filter maps it to. */
  status: number;
  /** entity: also write a migration (-m) and a repository (-r). */
  migration: boolean;
  repository: boolean;
  /** test: unit, integration or security. */
  testType: string;
  skipTests: boolean;
  /** resource, controller, endpoint: how callers authenticate. */
  auth: AuthSpec;
  /** resource, controller: GET routes need no authentication. */
  publicReads: boolean;
  /** endpoint: HTTP method, path under the controller, scope, method name. */
  method: string;
  path: string;
  scope: string | null;
  action: string | null;
};
