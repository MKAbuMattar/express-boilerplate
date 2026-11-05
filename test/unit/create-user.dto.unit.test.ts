import {isHttpResponse} from '@inversifyjs/http-core';
import {describe, expect, it} from 'vitest';
import {CreateUserDto} from '../../src/rest/dto/create-user.dto.js';

describe('CreateUserDto.from', () => {
  it('trims the name and lowercases the email', () => {
    const dto = CreateUserDto.from({
      name: '  Alice ',
      email: 'Alice@Example.COM',
      age: 42,
    });
    expect(dto).toMatchObject({
      name: 'Alice',
      email: 'alice@example.com',
      age: 42,
    });
  });

  it.each([
    [null, ['name', 'email', 'age']],
    ['a string', ['name', 'email', 'age']],
    [{name: 'A', email: 'a@b.co', age: 1.5}, ['age']],
    [{name: 'A', email: 'a@b.co', age: 151}, ['age']],
    [{name: 'A'.repeat(121), email: 'a@b.co', age: 1}, ['name']],
    [{name: 'A', email: 'no-at-sign', age: 1}, ['email']],
    [{name: '   ', email: 'a@b.co', age: 1}, ['name']],
  ])('rejects %j with 400 listing %j', (body, fields) => {
    try {
      CreateUserDto.from(body);
      expect.unreachable('should throw');
    } catch (error) {
      expect(isHttpResponse(error) && error.statusCode).toBe(400);
      const data = (error as {body: {data: object}}).body.data;
      expect(Object.keys(data)).toEqual(fields);
    }
  });

  it('accepts the boundaries 0 and 150', () => {
    expect(CreateUserDto.from({name: 'A', email: 'a@b.co', age: 0}).age).toBe(
      0,
    );
    expect(CreateUserDto.from({name: 'A', email: 'a@b.co', age: 150}).age).toBe(
      150,
    );
  });
});
