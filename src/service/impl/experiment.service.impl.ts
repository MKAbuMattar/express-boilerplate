import {createHash} from 'node:crypto';
import {NotFoundHttpResponse} from '@inversifyjs/http-core';
import {inject} from 'inversify';
import {AppConfig} from '../../config/app.config.js';
import {Service} from '../../config/stereotypes.js';
import {ExperimentVariant} from '../../enumeration/experiment-variant.enum.js';
import {ApiResponse} from '../../rest/dto/api-response.dto.js';
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
      throw new NotFoundHttpResponse(
        ApiResponse.fail(`Unknown experiment "${experiment}"`),
      );
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
