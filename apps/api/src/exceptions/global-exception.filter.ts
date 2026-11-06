import {
  ConflictException,
  DomainException,
  NotFoundException,
  ValidationException,
} from '@express-boilerplate/common/exceptions/domain.exception.js';
import {ProblemDetails} from '@express-boilerplate/common/exceptions/problem-details.js';
import {AppLogger} from '@express-boilerplate/common/util/app-logger.js';
import {HealthService} from '@express-boilerplate/service/service/health.service.js';
import {CatchError, isHttpResponse} from '@inversifyjs/http-core';
import type {ExpressErrorFilter} from '@inversifyjs/http-express';
import type {Request, Response} from 'express';
import {inject} from 'inversify';

@CatchError() // also registers the class as injectable
export class GlobalErrorFilter implements ExpressErrorFilter {
  // Errors that mean a dependency is unreachable, not that the request is
  // wrong. They get 503 so load balancers and clients retry later.
  private static readonly UNAVAILABLE_NAMES = new Set([
    'CannotExecuteNotConnectedError',
    'ConnectionIsNotSetError',
    // @feature:db-mongodb
    'MongoNetworkError',
    'MongoServerSelectionError',
    // @end:db-mongodb
  ]);
  private static readonly UNAVAILABLE_CODES = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
    'ENOTFOUND',
    'EHOSTUNREACH',
    // @feature:db-mysql
    'PROTOCOL_CONNECTION_LOST',
    // @end:db-mysql
    '57P01', // postgres admin_shutdown
    '57P03', // postgres cannot_connect_now
  ]);

  constructor(
    @inject(AppLogger) private readonly appLogger: AppLogger,
    @inject(HealthService) private readonly health: HealthService,
  ) {}

  catch(error: unknown, request: Request, response: Response): void {
    if (isHttpResponse(error)) {
      const headers = (error as {headers?: Record<string, string>}).headers;
      ProblemDetails.send(response, error.statusCode, error.body, headers);
      return;
    }
    if (error instanceof DomainException) {
      ProblemDetails.send(response, GlobalErrorFilter.domainStatus(error), {
        message: error.message,
        data: error.fields,
      });
      return;
    }
    this.appLogger.logger.error(
      {err: error, path: request.path},
      'Unhandled error',
    );
    if (this.isUnavailable(error)) {
      ProblemDetails.send(response, 503, 'Service Unavailable');
      return;
    }
    ProblemDetails.send(response, 500, 'Internal Server Error');
  }

  /** instanceof, so a subclass such as OrderNotFound maps like its parent. */
  private static domainStatus(error: DomainException): number {
    if (error instanceof NotFoundException) return 404;
    if (error instanceof ConflictException) return 409;
    if (error instanceof ValidationException) return 400;
    return 422;
  }

  private isUnavailable(error: unknown): boolean {
    if (!this.health.databaseUp) return true;
    if (!(error instanceof Error)) return false;
    const {code, driverError} = error as {
      code?: string;
      driverError?: {code?: string};
    };
    return (
      GlobalErrorFilter.UNAVAILABLE_NAMES.has(error.name) ||
      GlobalErrorFilter.UNAVAILABLE_CODES.has(code ?? '') ||
      GlobalErrorFilter.UNAVAILABLE_CODES.has(driverError?.code ?? '')
    );
  }
}
