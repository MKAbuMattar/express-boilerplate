import {
  AcceptedHttpResponse,
  Body,
  Controller,
  Get,
  HttpStatusCode,
  NotFoundHttpResponse,
  Params,
  Post,
  UseGuard,
} from '@inversifyjs/http-core';
import {
  OasParameter,
  OasRequestBody,
  OasResponse,
  OasSecurity,
  OasSummary,
} from '@inversifyjs/http-open-api';
import {inject} from 'inversify';
import {QueueBroker} from '../../../config/queue/queue-broker.js';
import {ApiConstants} from '../../../constant/api.constants.js';
import {OpenApiConstants} from '../../../constant/openapi.constants.js';
import {QueueConstants} from '../../../constant/queue.constants.js';
import type {DeadLetter} from '../../../model/dead-letter.js';
import {JwtGuard} from '../../../security/jwt/jwt.guard.js';
import {ApiResponse} from '../../dto/api-response.dto.js';

/** Enqueue jobs, inspect and replay dead letters. JWT on every route. */
@Controller(ApiConstants.V1_QUEUES)
@UseGuard(JwtGuard)
export class QueueV1Resource {
  constructor(@inject(QueueBroker) private readonly broker: QueueBroker) {}

  @OasSummary('List queues (JWT)')
  @OasSecurity({bearerAuth: []})
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('Queue names'))
  @Get()
  list(): ApiResponse<readonly string[]> {
    return ApiResponse.ok('Queues', QueueConstants.NAMES);
  }

  @OasSummary('Enqueue a job (JWT); 202, processed in the background')
  @OasSecurity({bearerAuth: []})
  @OasParameter(OpenApiConstants.QUEUE_PATH_PARAM)
  @OasRequestBody({
    content: {
      'application/json': {
        schema: {type: 'object', example: {fail: true}},
      },
    },
  })
  @OasResponse(HttpStatusCode.ACCEPTED, OpenApiConstants.json('Job accepted'))
  @OasResponse(HttpStatusCode.NOT_FOUND, OpenApiConstants.json('Unknown queue'))
  @Post('/:name/jobs')
  async enqueue(
    @Params({name: 'name'}) name: string,
    @Body() body: unknown,
  ): Promise<AcceptedHttpResponse> {
    QueueV1Resource.requireQueue(name);
    const payload =
      typeof body === 'object' && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const jobId = await this.broker.enqueue(name, payload);
    return new AcceptedHttpResponse(ApiResponse.ok('Job accepted', {jobId}));
  }

  @OasSummary('Dead letters of a queue (JWT)')
  @OasSecurity({bearerAuth: []})
  @OasParameter(OpenApiConstants.QUEUE_PATH_PARAM)
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('Dead letters'))
  @Get('/:name/dead-letters')
  async deadLetters(
    @Params({name: 'name'}) name: string,
  ): Promise<ApiResponse<DeadLetter[]>> {
    QueueV1Resource.requireQueue(name);
    return ApiResponse.ok('Dead letters', await this.broker.deadLetters(name));
  }

  @OasSummary('Replay a dead letter (JWT)')
  @OasSecurity({bearerAuth: []})
  @OasParameter(OpenApiConstants.QUEUE_PATH_PARAM)
  @OasParameter(OpenApiConstants.ID_PATH_PARAM)
  @OasResponse(HttpStatusCode.ACCEPTED, OpenApiConstants.json('Job re-queued'))
  @OasResponse(
    HttpStatusCode.NOT_FOUND,
    OpenApiConstants.json('Unknown dead letter'),
  )
  @Post('/:name/dead-letters/:id/replay')
  async replay(
    @Params({name: 'name'}) name: string,
    @Params({name: 'id'}) id: string,
  ): Promise<AcceptedHttpResponse> {
    QueueV1Resource.requireQueue(name);
    const jobId = await this.broker.replay(name, id);
    if (!jobId) {
      throw new NotFoundHttpResponse(ApiResponse.fail('Dead letter not found'));
    }
    return new AcceptedHttpResponse(ApiResponse.ok('Job re-queued', {jobId}));
  }

  private static requireQueue(name: string): void {
    if (!QueueConstants.NAMES.includes(name)) {
      throw new NotFoundHttpResponse(
        ApiResponse.fail(`Unknown queue "${name}"`),
      );
    }
  }
}
