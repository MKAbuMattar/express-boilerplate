import type {ExperimentVariant} from '@express-boilerplate/common/enumeration/experiment-variant.enum.js';

/** Contract for A/B experiments. Abstract class, so it exists at runtime as a DI token. */
export abstract class ExperimentService {
  /** Names of the configured experiments. */
  abstract names(): string[];

  /**
   * Sticky variant for a subject: the same experiment and subject always get
   * the same variant. Throws 404 for an unknown experiment.
   */
  abstract assign(experiment: string, subjectId: string): ExperimentVariant;
}
