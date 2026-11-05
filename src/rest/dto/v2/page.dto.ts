import {BadRequestHttpResponse} from '@inversifyjs/http-core';
import {ApiResponse} from '../api-response.dto.js';

/** Validated ?page=&size=&search= query. */
export class PageRequestDto {
  static readonly MAX_SIZE = 100;
  static readonly MAX_SEARCH = 100;

  private constructor(
    readonly page: number,
    readonly size: number,
    readonly search: string | null,
  ) {}

  static from(query: Record<string, unknown>): PageRequestDto {
    const errors: Record<string, string> = {};
    const page = PageRequestDto.integer(query.page, 1);
    const size = PageRequestDto.integer(query.size, 20);
    const search = query.search;

    if (page === null || page < 1) errors.page = 'must be an integer >= 1';
    if (size === null || size < 1 || size > PageRequestDto.MAX_SIZE) {
      errors.size = `must be an integer from 1 to ${PageRequestDto.MAX_SIZE}`;
    }
    if (
      search !== undefined &&
      (typeof search !== 'string' || search.length > PageRequestDto.MAX_SEARCH)
    ) {
      errors.search = `must be a string of at most ${PageRequestDto.MAX_SEARCH} characters`;
    }
    if (Object.keys(errors).length > 0) {
      throw new BadRequestHttpResponse(
        ApiResponse.fail('Validation failed', errors),
      );
    }
    const trimmed = typeof search === 'string' ? search.trim() : '';
    return new PageRequestDto(page!, size!, trimmed || null);
  }

  private static integer(value: unknown, fallback: number): number | null {
    if (value === undefined || value === '') return fallback;
    // Query strings carry text; QUERY bodies carry JSON numbers.
    if (typeof value === 'number')
      return Number.isInteger(value) ? value : null;
    const parsed = Number(value);
    return typeof value === 'string' && Number.isInteger(parsed)
      ? parsed
      : null;
  }
}

/** One page of results. */
export class PageDto<T> {
  readonly pages: number;

  constructor(
    readonly items: T[],
    readonly page: number,
    readonly size: number,
    readonly total: number,
  ) {
    this.pages = Math.ceil(total / size);
  }
}
