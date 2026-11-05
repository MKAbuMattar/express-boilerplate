import type {RequestHandler} from 'express';
import {ApiConstants} from '../../constant/api.constants.js';

/**
 * URL-path versioning: /api/v1/..., /api/v2/...
 * Unversioned /api/... keeps working as an alias of the default version, so
 * clients written before versioning do not break. Every API response carries
 * an API-Version header naming the version that answered.
 */
export class ApiVersioning {
  private static readonly VERSIONED = /^\/api\/(v\d+)(?=\/|$|\?)/;

  static middleware(): RequestHandler {
    return (request, response, next) => {
      if (request.url.startsWith('/api/') || request.url === '/api') {
        const match = ApiVersioning.VERSIONED.exec(request.url);
        if (!match) {
          request.url = `/api/${ApiConstants.DEFAULT_VERSION}${request.url.slice(4)}`;
        }
        response.setHeader(
          'API-Version',
          match?.[1] ?? ApiConstants.DEFAULT_VERSION,
        );
      }
      next();
    };
  }
}
