import {readFileSync} from 'node:fs';
import {Controller, Get, Response} from '@inversifyjs/http-core';
import {OasSummary} from '@inversifyjs/http-open-api';
import type {Response as ExpressResponse} from 'express';
import {inject} from 'inversify';
import {ActuatorConstants} from '../constant/actuator.constants.js';
import type {HealthReport} from '../model/health.js';
import {HealthService} from '../service/health.service.js';

/**
 * Spring Boot Actuator-compatible endpoints, plus the Kubernetes short paths.
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

  @OasSummary('Actuator health: every indicator')
  @Get('/health')
  async health(@Response() response: ExpressResponse): Promise<void> {
    ActuatorResponses.health(response, await this.healthService.health('all'));
  }

  @OasSummary('Actuator liveness group')
  @Get('/health/liveness')
  async liveness(@Response() response: ExpressResponse): Promise<void> {
    ActuatorResponses.health(
      response,
      await this.healthService.health('liveness'),
    );
  }

  @OasSummary('Actuator readiness group')
  @Get('/health/readiness')
  async readiness(@Response() response: ExpressResponse): Promise<void> {
    ActuatorResponses.health(
      response,
      await this.healthService.health('readiness'),
    );
  }

  @OasSummary('Actuator info: application and runtime')
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

  @OasSummary('Health (alias of /actuator/health)')
  @Get('/healthz')
  async healthz(@Response() response: ExpressResponse): Promise<void> {
    ActuatorResponses.health(response, await this.healthService.health('all'));
  }

  @OasSummary('Liveness probe (alias of /actuator/health/liveness)')
  @Get('/livez')
  async livez(@Response() response: ExpressResponse): Promise<void> {
    ActuatorResponses.health(
      response,
      await this.healthService.health('liveness'),
    );
  }

  @OasSummary('Readiness probe (alias of /actuator/health/readiness)')
  @Get('/readyz')
  async readyz(@Response() response: ExpressResponse): Promise<void> {
    ActuatorResponses.health(
      response,
      await this.healthService.health('readiness'),
    );
  }
}
