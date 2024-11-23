import {StatusCodes} from 'http-status-codes';

export class ServiceResponse<T = null> {
  readonly success: boolean;
  readonly message: string;
  readonly response: T;
  readonly statusCode: number;

  private constructor(
    success: boolean,
    message: string,
    response: T,
    statusCode: number,
  ) {
    this.success = success;
    this.message = message;
    this.response = response;
    this.statusCode = statusCode;
  }

  static success<T>(
    message: string,
    response: T,
    statusCode: number = StatusCodes.OK,
  ) {
    return new ServiceResponse(true, message, response, statusCode);
  }

  static failure<T>(
    message: string,
    response: T,
    statusCode: number = StatusCodes.BAD_REQUEST,
  ) {
    return new ServiceResponse(false, message, response, statusCode);
  }
}
