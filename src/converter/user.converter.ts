import type {UserEntity} from '../model/user.entity.js';
import {UserDto} from '../rest/dto/user.dto.js';

export class UserConverter {
  /** Accepts an entity or its cached JSON copy (dates as ISO strings). */
  static toDto(user: UserEntity): UserDto {
    return new UserDto(
      String(user.id),
      user.name,
      user.email,
      user.age,
      new Date(user.createdAt).toISOString(),
      new Date(user.updatedAt).toISOString(),
    );
  }

  static toDtoList(users: UserEntity[]): UserDto[] {
    return users.map((user) => UserConverter.toDto(user));
  }
}
