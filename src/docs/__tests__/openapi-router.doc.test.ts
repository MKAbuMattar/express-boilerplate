import {StatusCodes} from 'http-status-codes';
import request from 'supertest';

import {app} from '@/server';

describe('OpenAPI Router', () => {
  describe('GET /docs/swagger.json', () => {
    it('should return the OpenAPI document', async () => {
      // Act
      const response = await request(app).get('/docs/swagger.json');
      const responseBody = response.body;

      // Assert
      expect(response.statusCode).toEqual(StatusCodes.OK);
      expect(responseBody.openapi).toEqual('3.0.0');
      expect(responseBody.info.version).toEqual('0.0.0');
      expect(responseBody.info.title).toEqual('API Documentation');
      expect(responseBody.externalDocs.description).toEqual(
        'View the raw OpenAPI Specification in JSON format',
      );
      expect(responseBody.externalDocs.url).toEqual('/docs/swagger.json');
    });
  });
});
