import {BadRequestHttpResponse} from '@inversifyjs/http-core';
import {ApiResponse} from './api-response.dto.js';

export class CreateUserDto {
  private static readonly EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private constructor(
    readonly name: string,
    readonly email: string,
    readonly age: number,
  ) {}

  /** Validates untrusted input; throws 400 with every failing field. */
  static from(body: unknown): CreateUserDto {
    const input = (
      typeof body === 'object' && body !== null ? body : {}
    ) as Record<string, unknown>;
    const errors: Record<string, string> = {};
    const {name, email, age} = input;

    if (
      typeof name !== 'string' ||
      name.trim().length < 1 ||
      name.length > 120
    ) {
      errors.name = 'must be a string of 1 to 120 characters';
    }
    if (
      typeof email !== 'string' ||
      email.length > 254 ||
      !CreateUserDto.EMAIL.test(email)
    ) {
      errors.email = 'must be a valid email address';
    }
    if (
      !Number.isInteger(age) ||
      (age as number) < 0 ||
      (age as number) > 150
    ) {
      errors.age = 'must be an integer from 0 to 150';
    }

    if (Object.keys(errors).length > 0) {
      throw new BadRequestHttpResponse(
        ApiResponse.fail('Validation failed', errors),
      );
    }
    return new CreateUserDto(
      (name as string).trim(),
      (email as string).toLowerCase(),
      age as number,
    );
  }
}
