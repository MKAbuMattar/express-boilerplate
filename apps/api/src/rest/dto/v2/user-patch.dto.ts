import {BadRequestHttpResponse} from '@inversifyjs/http-core';
import {ApiResponse} from '../api-response.dto.js';
import {CreateUserDto} from '../create-user.dto.js';

/**
 * PATCH body (JSON or application/merge-patch+json, RFC 7396): only the
 * fields to change. phone: null clears the phone. Unknown fields are rejected
 * so a typo never silently does nothing.
 */
export class UserPatchDto {
  private static readonly FIELDS = new Set(['name', 'email', 'age', 'phone']);

  private constructor(
    readonly changes: {
      name?: string;
      email?: string;
      age?: number;
      phone?: string | null;
    },
  ) {}

  static from(body: unknown): UserPatchDto {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw UserPatchDto.invalid({body: 'must be a JSON object'});
    }
    const input = body as Record<string, unknown>;
    const keys = Object.keys(input);
    const unknown = keys.filter((key) => !UserPatchDto.FIELDS.has(key));
    if (keys.length === 0 || unknown.length > 0) {
      throw UserPatchDto.invalid(
        unknown.length > 0
          ? Object.fromEntries(unknown.map((key) => [key, 'is not a field']))
          : {body: 'must change at least one field'},
      );
    }
    // Validate by filling the missing fields with valid placeholders and
    // reusing the v2 create rules, so both paths agree on what is valid.
    const merged = {
      name: 'x',
      email: 'x@x.xx',
      age: 0,
      ...input,
    };
    try {
      CreateUserDto.fromV2(merged);
    } catch (error) {
      throw UserPatchDto.invalid(
        (error as {body: {data: Record<string, string>}}).body.data,
      );
    }
    const changes: UserPatchDto['changes'] = {};
    if ('name' in input) changes.name = String(input.name).trim();
    if ('email' in input) changes.email = String(input.email).toLowerCase();
    if ('age' in input) changes.age = input.age as number;
    if ('phone' in input)
      changes.phone = (input.phone as string | null) ?? null;
    return new UserPatchDto(changes);
  }

  private static invalid(errors: Record<string, string>) {
    return new BadRequestHttpResponse(
      ApiResponse.fail('Validation failed', errors),
    );
  }
}
