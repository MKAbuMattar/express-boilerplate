import {ApiResponse} from '@express-boilerplate/common/rest/dto/api-response.dto.js';
import {BadRequestHttpResponse} from '@inversifyjs/http-core';

export class CreateUserDto {
  private static readonly EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  private static readonly PHONE = /^\+?[0-9 ()-]{6,32}$/;

  private constructor(
    readonly name: string,
    readonly email: string,
    readonly age: number,
    readonly phone: string | null = null,
  ) {}

  /** API v2: v1 fields plus an optional phone. */
  static fromV2(body: unknown): CreateUserDto {
    const phone = (body as {phone?: unknown} | null)?.phone;
    const phoneError =
      phone !== undefined &&
      phone !== null &&
      (typeof phone !== 'string' || !CreateUserDto.PHONE.test(phone));
    let base: CreateUserDto | undefined;
    let errors: Record<string, string> = {};
    try {
      base = CreateUserDto.from(body);
    } catch (error) {
      errors = (error as {body: {data: Record<string, string>}}).body.data;
    }
    if (phoneError) errors.phone = 'must be 6 to 32 digits, spaces, ()+-';
    if (!base || phoneError) {
      throw new BadRequestHttpResponse(
        ApiResponse.fail('Validation failed', errors),
      );
    }
    return new CreateUserDto(
      base.name,
      base.email,
      base.age,
      typeof phone === 'string' ? phone : null,
    );
  }

  /** API v1. Validates untrusted input; throws 400 with every failing field. */
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
