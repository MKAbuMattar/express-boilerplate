import {CatchError, isHttpResponse} from '@inversifyjs/http-core';
import type {ExpressErrorFilter} from '@inversifyjs/http-express';
import type {Request, Response} from 'express';
import {inject} from 'inversify';
import {ApiResponse} from '../rest/dto/api-response.dto.js';
import {AppLogger} from '../util/app-logger.js';

@CatchError() // also registers the class as injectable
export class GlobalErrorFilter implements ExpressErrorFilter {
  constructor(@inject(AppLogger) private readonly appLogger: AppLogger) {}

  catch(error: unknown, request: Request, response: Response): void {
    if (isHttpResponse(error)) {
      response.status(error.statusCode).json(error.body);
      return;
    }
    this.appLogger.logger.error(
      {err: error, path: request.path},
      'Unhandled error',
    );
    response.status(500).json(ApiResponse.fail('Internal Server Error'));
  }
}
