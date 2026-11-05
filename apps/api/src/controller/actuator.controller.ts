import {readFileSync} from 'node:fs';
import {
  Controller,
  Get,
  HttpStatusCode,
  Response,
} from '@inversifyjs/http-core';
import {OasResponse, OasSummary, OasTag} from '@inversifyjs/http-open-api';
import type {Response as ExpressResponse} from 'express';
import {inject} from 'inversify';
import {ActuatorConstants} from '../constant/actuator.constants.js';
import {OpenApiConstants} from '../constant/openapi.constants.js';
import type {HealthReport} from '../model/health.js';
import {HealthService} from '../service/health.service.js';

/**
 * Health, info and metrics endpoints, plus the Kubernetes short paths.
 *
 *   /actuator/health             /healthz   every indicator
 *   /actuator/health/liveness    /livez     ping only
 *   /actuator/health/readiness   /readyz    db and cache
 *   /actuator/info                          app and runtime (ops networks only)
 *   /actuator/prometheus                    = /metrics (ops networks only)
 */
export class ActuatorResponses {
  static send(response: ExpressResponse, body: object, status = 200): void {
    response
      .status(status)
      .type(ActuatorConstants.MEDIA_TYPE)
      .setHeader('Cache-Control', 'no-store')
      .send(JSON.stringify(body));
  }

  static health(response: ExpressResponse, report: HealthReport): void {
    ActuatorResponses.send(
      response,
      {status: report.status, components: report.components},
      report.httpStatus,
    );
  }
}

@Controller('/actuator')
export class ActuatorController {
  private static readonly startedAt = Date.now();
  private static info?: object;

  constructor(
    @inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @OasTag('Actuator')

  @OasSummary('Actuator health: every indicator')

  @OasResponse(
    HttpStatusCode.OK,

    OpenApiConstants.raw(
      'UP',
      ActuatorConstants.MEDIA_TYPE,
      OpenApiConstants.ref('ActuatorHealth'),
    ),
  )

  @OasResponse(
    HttpStatusCode.SERVICE_UNAVAILABLE,

    OpenApiConstants.raw(
      'DOWN',
      ActuatorConstants.MEDIA_TYPE,
      OpenApiConstants.ref('ActuatorHealth'),
    ),
  )
  @Get('/health')
  async health(@Response() response: ExpressResponse): Promise<void> {
    ActuatorResponses.health(response, await this.healthService.health('all'));
  }

  @OasTag('Actuator')

  @OasSummary('Actuator liveness group')

  @OasResponse(
    HttpStatusCode.OK,

    OpenApiConstants.raw(
      'UP',
      ActuatorConstants.MEDIA_TYPE,
      OpenApiConstants.ref('ActuatorHealth'),
    ),
  )

  @OasResponse(
    HttpStatusCode.SERVICE_UNAVAILABLE,

    OpenApiConstants.raw(
      'DOWN',
      ActuatorConstants.MEDIA_TYPE,
      OpenApiConstants.ref('ActuatorHealth'),
    ),
  )
  @Get('/health/liveness')
  async liveness(@Response() response: ExpressResponse): Promise<void> {
    ActuatorResponses.health(
      response,
      await this.healthService.health('liveness'),
    );
  }

  @OasTag('Actuator')

  @OasSummary('Actuator readiness group')

  @OasResponse(
    HttpStatusCode.OK,

    OpenApiConstants.raw(
      'UP',
      ActuatorConstants.MEDIA_TYPE,
      OpenApiConstants.ref('ActuatorHealth'),
    ),
  )

  @OasResponse(
    HttpStatusCode.SERVICE_UNAVAILABLE,

    OpenApiConstants.raw(
      'DOWN',
      ActuatorConstants.MEDIA_TYPE,
      OpenApiConstants.ref('ActuatorHealth'),
    ),
  )
  @Get('/health/readiness')
  async readiness(@Response() response: ExpressResponse): Promise<void> {
    ActuatorResponses.health(
      response,
      await this.healthService.health('readiness'),
    );
  }

  @OasTag('Actuator')

  @OasSummary('Actuator info: application and runtime')

  @OasResponse(
    HttpStatusCode.OK,

    OpenApiConstants.raw(
      'Application and runtime',
      ActuatorConstants.MEDIA_TYPE,
      {type: 'object'},
    ),
  )

  @OasResponse(
    HttpStatusCode.FORBIDDEN,
    OpenApiConstants.problem('Not an ops network'),
  )
  @Get('/info')
  info(@Response() response: ExpressResponse): void {
    ActuatorController.info ??= ActuatorController.readInfo();
    ActuatorResponses.send(response, {
      ...ActuatorController.info,
      uptimeSeconds: Math.round(
        (Date.now() - ActuatorController.startedAt) / 1000,
      ),
    });
  }

  private static readInfo(): object {
    let pkg: {name?: string; version?: string; description?: string} = {};
    try {
      pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    } catch {
      // Not fatal: info is best effort.
    }
    return {
      app: {name: pkg.name, version: pkg.version, description: pkg.description},
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };
  }
}

/** Kubernetes-style aliases of the Actuator health groups. */
@Controller()
export class ProbeController {
  constructor(
    @inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @OasTag('Actuator')

  @OasSummary('Health (alias of /actuator/health)')

  @OasResponse(
    HttpStatusCode.OK,

    OpenApiConstants.raw(
      'UP',
      ActuatorConstants.MEDIA_TYPE,
      OpenApiConstants.ref('ActuatorHealth'),
    ),
  )

  @OasResponse(
    HttpStatusCode.SERVICE_UNAVAILABLE,

    OpenApiConstants.raw(
      'DOWN',
      ActuatorConstants.MEDIA_TYPE,
      OpenApiConstants.ref('ActuatorHealth'),
    ),
  )
  @Get('/healthz')
  async healthz(@Response() response: ExpressResponse): Promise<void> {
    ActuatorResponses.health(response, await this.healthService.health('all'));
  }

  @OasTag('Actuator')

  @OasSummary('Liveness probe (alias of /actuator/health/liveness)')

  @OasResponse(
    HttpStatusCode.OK,

    OpenApiConstants.raw(
      'UP',
      ActuatorConstants.MEDIA_TYPE,
      OpenApiConstants.ref('ActuatorHealth'),
    ),
  )

  @OasResponse(
    HttpStatusCode.SERVICE_UNAVAILABLE,

    OpenApiConstants.raw(
      'DOWN',
      ActuatorConstants.MEDIA_TYPE,
      OpenApiConstants.ref('ActuatorHealth'),
    ),
  )
  @Get('/livez')
  async livez(@Response() response: ExpressResponse): Promise<void> {
    ActuatorResponses.health(
      response,
      await this.healthService.health('liveness'),
    );
  }

  @OasTag('Actuator')

  @OasSummary('Readiness probe (alias of /actuator/health/readiness)')

  @OasResponse(
    HttpStatusCode.OK,

    OpenApiConstants.raw(
      'UP',
      ActuatorConstants.MEDIA_TYPE,
      OpenApiConstants.ref('ActuatorHealth'),
    ),
  )

  @OasResponse(
    HttpStatusCode.SERVICE_UNAVAILABLE,

    OpenApiConstants.raw(
      'DOWN',
      ActuatorConstants.MEDIA_TYPE,
      OpenApiConstants.ref('ActuatorHealth'),
    ),
  )
  @Get('/readyz')
  async readyz(@Response() response: ExpressResponse): Promise<void> {
    ActuatorResponses.health(
      response,
      await this.healthService.health('readiness'),
    );
  }
}
