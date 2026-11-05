import {CatchError, isHttpResponse} from '@inversifyjs/http-core';
import type {ExpressErrorFilter} from '@inversifyjs/http-express';
import type {Request, Response} from 'express';
import {inject} from 'inversify';
import {DataSource} from 'typeorm';
import {AppLogger} from '../util/app-logger.js';
import {ProblemDetails} from './problem-details.js';

@CatchError() // also registers the class as injectable
export class GlobalErrorFilter implements ExpressErrorFilter {
  // Errors that mean a dependency is unreachable, not that the request is
  // wrong. They get 503 so load balancers and clients retry later.
  private static readonly UNAVAILABLE_NAMES = new Set([
    'CannotExecuteNotConnectedError',
    'ConnectionIsNotSetError',
    'MongoNetworkError',
    'MongoServerSelectionError',
  ]);
  private static readonly UNAVAILABLE_CODES = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'PROTOCOL_CONNECTION_LOST',
    '57P01', // postgres admin_shutdown
    '57P03', // postgres cannot_connect_now
  ]);

  constructor(
    @inject(AppLogger) private readonly appLogger: AppLogger,
    @inject(DataSource) private readonly dataSource: DataSource,
  ) {}

  catch(error: unknown, request: Request, response: Response): void {
    const instance = request.originalUrl;
    if (isHttpResponse(error)) {
      const headers = (error as {headers?: Record<string, string>}).headers;
      ProblemDetails.send(
        response,
        error.statusCode,
        error.body,
        instance,
        headers,
      );
      return;
    }
    this.appLogger.logger.error(
      {err: error, path: request.path},
      'Unhandled error',
    );
    if (this.isUnavailable(error)) {
      ProblemDetails.send(response, 503, 'Service Unavailable', instance);
      return;
    }
    ProblemDetails.send(response, 500, 'Internal Server Error', instance);
  }

  private isUnavailable(error: unknown): boolean {
    if (!this.dataSource.isInitialized) return true;
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
