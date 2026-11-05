import {randomUUID} from 'node:crypto';
import {
  Controller,
  Get,
  HttpStatusCode,
  Params,
  Request,
  Response,
} from '@inversifyjs/http-core';
import {
  OasParameter,
  OasResponse,
  OasSummary,
} from '@inversifyjs/http-open-api';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import {inject} from 'inversify';
import {ApiConstants} from '../../../constant/api.constants.js';
import {ExperimentConstants} from '../../../constant/experiment.constants.js';
import {OpenApiConstants} from '../../../constant/openapi.constants.js';
import {SessionService} from '../../../security/sso/session.service.js';
import {ExperimentService} from '../../../service/experiment.service.js';
import {ApiResponse} from '../../dto/api-response.dto.js';

@Controller(ApiConstants.V1_EXPERIMENTS)
export class ExperimentV1Resource {
  constructor(
    @inject(ExperimentService)
    private readonly experimentService: ExperimentService,
    @inject(SessionService) private readonly sessionService: SessionService,
  ) {}

  @OasSummary('List A/B experiments')
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('Experiment names'))
  @Get()
  list(): ApiResponse<string[]> {
    return ApiResponse.ok('Experiments', this.experimentService.names());
  }

  @OasSummary('Variant for the caller (SSO subject, else an ab_id cookie)')
  @OasParameter({
    name: 'name',
    in: 'path',
    required: true,
    schema: {type: 'string', example: 'new-checkout'},
  })
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('Assigned variant'))
  @OasResponse(
    HttpStatusCode.NOT_FOUND,
    OpenApiConstants.json('Unknown experiment'),
  )
  @Get('/:name')
  async variant(
    @Params({name: 'name'}) name: string,
    @Request() request: ExpressRequest,
    @Response() response: ExpressResponse,
  ): Promise<void> {
    const subject = await this.subjectOf(request, response);
    const variant = this.experimentService.assign(name, subject);
    response
      .setHeader(ExperimentConstants.VARIANT_HEADER, variant)
      .json(ApiResponse.ok('Variant assigned', {experiment: name, variant}));
  }

  /** Signed-in users keep their variant across devices; visitors get a cookie. */
  private async subjectOf(
    request: ExpressRequest,
    response: ExpressResponse,
  ): Promise<string> {
    const principal = await this.sessionService.read(request);
    if (principal) return `${principal.strategy}:${principal.subject}`;

    const existing: unknown =
      request.signedCookies?.[ExperimentConstants.SUBJECT_COOKIE];
    if (typeof existing === 'string' && existing) return existing;

    const subject = randomUUID();
    response.cookie(ExperimentConstants.SUBJECT_COOKIE, subject, {
      ...this.sessionService.cookieOptions,
      signed: true,
      maxAge: ExperimentConstants.SUBJECT_COOKIE_MAX_AGE_MS,
    });
    return subject;
  }
}
