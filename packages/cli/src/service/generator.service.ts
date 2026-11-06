import type {GenerateOptions} from '../model/generate-options.ts';
import type {Plan} from '../model/plan.ts';

/** Contract for planning generated code. Planning writes nothing. */
export abstract class GeneratorService {
  /** The files to create and the registrations to edit for one kind. */
  abstract plan(kind: string, root: string, options: GenerateOptions): Plan;
}
