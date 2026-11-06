import {createHash} from 'node:crypto';
import {AppConfig} from '@express-boilerplate/common/config/app.config.js';
import {Service} from '@express-boilerplate/common/config/stereotypes.js';
import {ExperimentVariant} from '@express-boilerplate/common/enumeration/experiment-variant.enum.js';
import {NotFoundException} from '@express-boilerplate/common/exceptions/domain.exception.js';
import {inject} from 'inversify';
import {ExperimentService} from '../experiment.service.js';

/**
 * Deterministic bucketing: hash(experiment:subject) into 0..99 and compare it
 * with the experiment's percentage for A. No storage, so every instance gives
 * the same answer, and each experiment splits users independently.
 */
@Service()
export class ExperimentServiceImpl extends ExperimentService {
  constructor(@inject(AppConfig) private readonly config: AppConfig) {
    super();
  }

  names(): string[] {
    return [...this.config.experiments.keys()];
  }

  assign(experiment: string, subjectId: string): ExperimentVariant {
    const percentA = this.config.experiments.get(experiment);
    if (percentA === undefined) {
      throw new NotFoundException(`Unknown experiment "${experiment}"`);
    }
    return ExperimentServiceImpl.bucket(experiment, subjectId) < percentA
      ? ExperimentVariant.A
      : ExperimentVariant.B;
  }

  /** 0..99, stable for the same experiment and subject. */
  static bucket(experiment: string, subjectId: string): number {
    return (
      createHash('sha256')
        .update(`${experiment}:${subjectId}`)
        .digest()
        .readUInt32BE(0) % 100
    );
  }
}
