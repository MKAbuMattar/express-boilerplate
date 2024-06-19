import {StatusCodes} from 'http-status-codes';
import {z} from 'zod';

// Models
import {ServiceResponseSchema} from '@/models/service-response.model';

export function createApiResponse(
  schema: z.ZodTypeAny,
  description: string,
  statusCode = StatusCodes.OK,
) {
  return {
    [statusCode]: {
      description,
      content: {
        'application/json': {
          schema: ServiceResponseSchema(schema),
        },
      },
    },
  };
}
