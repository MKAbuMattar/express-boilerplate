import type {IHealthResponse} from '@/api/health/health.model';
import {app} from '@/server';
import {StatusCodes} from 'http-status-codes';
import request from 'supertest';

describe('Health API endpoints', () => {
  it('GET / - success', async () => {
    const response = await request(app).get('/api/health');
    const result: IHealthResponse = response.body;

    expect(response.statusCode).toEqual(StatusCodes.OK);
    expect(result.success).toBeTruthy();
    expect(result.response).toBeNull();
    expect(result.message).toEqual('Service is healthy');
  });
});
