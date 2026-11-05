export class ApiResponse<T = null> {
  private constructor(
    readonly success: boolean,
    readonly message: string,
    readonly data: T,
  ) {}

  static ok<T>(message: string, data: T): ApiResponse<T> {
    return new ApiResponse(true, message, data);
  }

  static fail<T = null>(message: string, data: T = null as T): ApiResponse<T> {
    return new ApiResponse(false, message, data);
  }
}
