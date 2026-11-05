import {STATUS_CODES} from 'node:http';
import type {Response} from 'express';

/**
 * RFC 9457 Problem Details: the one error format for every 4xx and 5xx,
 * sent as application/problem+json.
 *
 * `success`, `message` and `data` are extension members (allowed by the RFC)
 * that keep the shape of the success envelope, so clients written for
 * ApiResponse keep working. `data` carries field errors on 400.
 */
export class ProblemDetails {
  static readonly CONTENT_TYPE = 'application/problem+json';
  /** Headers each status must or should carry. */
  private static readonly STATUS_HEADERS: Record<
    number,
    Record<string, string>
  > = {
    401: {'WWW-Authenticate': 'Bearer'},
    429: {'Retry-After': '60'},
    503: {'Retry-After': '5'},
  };

  readonly type = 'about:blank';
  readonly title: string;
  readonly success = false;
  readonly message: string;

  /** Same as the X-Request-Id header; quote it when reporting an error. */
  requestId?: string;

  constructor(
    readonly status: number,
    readonly detail: string,
    readonly instance: string,
    readonly data: unknown = null,
  ) {
    this.title = STATUS_CODES[status] ?? 'Error';
    this.message = detail;
  }

  /** From whatever body an error carried (ApiResponse.fail, string, nothing). */
  static from(status: number, body: unknown, instance: string): ProblemDetails {
    const {message, data} = (
      typeof body === 'object' && body !== null ? body : {}
    ) as {message?: unknown; data?: unknown};
    const detail =
      typeof message === 'string'
        ? message
        : typeof body === 'string'
          ? body
          : (STATUS_CODES[status] ?? 'Error');
    return new ProblemDetails(status, detail, instance, data ?? null);
  }

  /** True for a body that is already a problem document. */
  static isProblem(body: unknown): boolean {
    return (
      typeof body === 'object' &&
      body !== null &&
      'type' in body &&
      'status' in body &&
      'title' in body
    );
  }

  /** Headers RFC 9110 expects with this status, unless already set. */
  static statusHeaders(status: number): Record<string, string> {
    return ProblemDetails.STATUS_HEADERS[status] ?? {};
  }

  static send(
    response: Response,
    status: number,
    body: unknown,
    instance: string,
    headers: Record<string, string> = {},
  ): void {
    if (response.headersSent) return;
    const problem = ProblemDetails.from(status, body, instance);
    const requestId = response.getHeader('X-Request-Id');
    if (typeof requestId === 'string') problem.requestId = requestId;
    response
      .status(status)
      .set({...ProblemDetails.STATUS_HEADERS[status], ...headers})
      .type(ProblemDetails.CONTENT_TYPE)
      .send(JSON.stringify(problem));
  }
}
