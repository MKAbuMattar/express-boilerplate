import {ProblemDetails} from '@express-boilerplate/common/exceptions/problem-details.js';
import {ApiResponse} from '@express-boilerplate/common/rest/dto/api-response.dto.js';
import {isHttpResponse} from '@inversifyjs/http-core';
import {describe, expect, it} from 'vitest';
import {ApiVersioning} from '../../src/config/web/api-versioning.js';
import {PageDto, PageRequestDto} from '../../src/rest/dto/v2/page.dto.js';
import {UserPatchDto} from '../../src/rest/dto/v2/user-patch.dto.js';
import {Preconditions} from '../../src/rest/preconditions.js';

const statusOf = (action: () => unknown) => {
  try {
    action();
    return 200;
  } catch (error) {
    return isHttpResponse(error) ? error.statusCode : -1;
  }
};

describe('ApiVersioning', () => {
  const run = (url: string) => {
    const request = {url} as {url: string};
    const headers: Record<string, string> = {};
    ApiVersioning.middleware()(
      request as never,
      {setHeader: (k: string, v: string) => (headers[k] = v)} as never,
      () => {},
    );
    return {url: request.url, version: headers['API-Version']};
  };

  it.each([
    ['/api/users', '/api/v1/users', 'v1'],
    ['/api/users?x=1', '/api/v1/users?x=1', 'v1'],
    ['/api/v1/users', '/api/v1/users', 'v1'],
    ['/api/v2/users/5', '/api/v2/users/5', 'v2'],
    ['/api/v2?x', '/api/v2?x', 'v2'],
    ['/api/version', '/api/v1/version', 'v1'],
    ['/auth/me', '/auth/me', undefined],
  ])('%s -> %s (%s)', (input, url, version) => {
    expect(run(input)).toEqual({url, version});
  });
});

describe('ProblemDetails', () => {
  it('builds RFC 9457 fields plus the compatibility members', () => {
    const problem = ProblemDetails.from(
      400,
      ApiResponse.fail('Validation failed', {age: 'bad'}),
      '/api/v2/users',
    );
    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'Validation failed',
      instance: '/api/v2/users',
      success: false,
      message: 'Validation failed',
      data: {age: 'bad'},
    });
  });
  it('falls back to the reason phrase for empty bodies', () => {
    expect(ProblemDetails.from(503, undefined, '/x').detail).toBe(
      'Service Unavailable',
    );
    expect(ProblemDetails.isProblem(ProblemDetails.from(404, 'x', '/'))).toBe(
      true,
    );
    expect(ProblemDetails.isProblem({message: 'x'})).toBe(false);
  });
});

describe('Preconditions', () => {
  it('If-Match: matches pass, mismatches and missing resources are 412', () => {
    expect(statusOf(() => Preconditions.check('"a"', '"a"', undefined))).toBe(
      200,
    );
    expect(
      statusOf(() => Preconditions.check('"a"', 'W/"a", "b"', undefined)),
    ).toBe(200);
    expect(statusOf(() => Preconditions.check('"a"', '*', undefined))).toBe(
      200,
    );
    expect(statusOf(() => Preconditions.check('"a"', '"b"', undefined))).toBe(
      412,
    );
    expect(statusOf(() => Preconditions.check(null, '*', undefined))).toBe(412);
  });
  it('If-None-Match: * blocks overwriting an existing resource', () => {
    expect(statusOf(() => Preconditions.check('"a"', undefined, '*'))).toBe(
      412,
    );
    expect(statusOf(() => Preconditions.check(null, undefined, '*'))).toBe(200);
  });
  it('no headers, no checks', () => {
    expect(
      statusOf(() => Preconditions.check('"a"', undefined, undefined)),
    ).toBe(200);
  });
});

describe('PageRequestDto / PageDto', () => {
  it('defaults, parses strings and numbers, trims search', () => {
    expect(PageRequestDto.from({})).toMatchObject({
      page: 1,
      size: 20,
      search: null,
    });
    expect(
      PageRequestDto.from({page: '2', size: 5, search: '  al '}),
    ).toMatchObject({page: 2, size: 5, search: 'al'});
  });
  it.each([
    {page: '0'},
    {page: '1.5'},
    {size: '101'},
    {size: 'x'},
    {search: 'x'.repeat(101)},
    {search: 5},
  ])('rejects %j', (query) => {
    expect(statusOf(() => PageRequestDto.from(query))).toBe(400);
  });
  it('computes page count', () => {
    expect(new PageDto([], 1, 20, 41).pages).toBe(3);
    expect(new PageDto([], 1, 20, 0).pages).toBe(0);
  });
});

describe('UserPatchDto', () => {
  it('keeps only the fields sent, normalized', () => {
    expect(UserPatchDto.from({email: 'A@B.CO'}).changes).toEqual({
      email: 'a@b.co',
    });
    expect(UserPatchDto.from({phone: null}).changes).toEqual({phone: null});
  });
  it.each([null, [], {}, {nmae: 'x'}, {age: -1}, {email: 'x'}, {phone: 'abc'}])(
    'rejects %j',
    (body) => {
      expect(statusOf(() => UserPatchDto.from(body))).toBe(400);
    },
  );
});
