import {z} from 'zod';

export enum ResponseStatus {
  Success = 0,
  Failed = 1,
}

export class ServiceResponse<T = null> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;

  constructor(
    status: ResponseStatus,
    statusCode: number,
    message: string,
    data: T,
  ) {
    this.success = status === ResponseStatus.Success;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }
}

export const ServiceResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    statusCode: z.number(),
    message: z.string(),
    data: dataSchema.optional(),
  });
