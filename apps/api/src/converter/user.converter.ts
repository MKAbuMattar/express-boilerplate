import {createHash} from 'node:crypto';
import type {UserEntity} from '@express-boilerplate/persistence/model/user.entity.js';
import {UserV1Dto} from '../rest/dto/v1/user.dto.js';
import {UserV2Dto} from '../rest/dto/v2/user.dto.js';

export class UserConverter {
  /** Accepts an entity or its cached JSON copy (dates as ISO strings). */
  static toDto(user: UserEntity): UserV1Dto {
    return new UserV1Dto(
      String(user.id),
      user.name,
      user.email,
      user.age,
      new Date(user.createdAt).toISOString(),
      new Date(user.updatedAt).toISOString(),
    );
  }

  /** v2 adds phone. */
  static toV2Dto(user: UserEntity): UserV2Dto {
    return new UserV2Dto(
      String(user.id),
      user.name,
      user.email,
      user.age,
      user.phone ?? null,
      new Date(user.createdAt).toISOString(),
      new Date(user.updatedAt).toISOString(),
    );
  }

  /** Strong ETag of the v2 representation: changes whenever its content does. */
  static etag(user: UserEntity): string {
    const json = JSON.stringify(UserConverter.toV2Dto(user));
    return `"${createHash('sha256').update(json).digest('base64url').slice(0, 27)}"`;
  }
}
