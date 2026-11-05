import type {UserEntity} from '../model/user.entity.js';
import type {CreateUserDto} from '../rest/dto/create-user.dto.js';

/** Contract for user operations. Abstract class, so it exists at runtime as a DI token. */
export abstract class UserService {
  abstract findAll(): Promise<UserEntity[]>;
  /** API v2: paged and optionally searched; not cached (too many variants). */
  abstract findPage(
    page: number,
    size: number,
    search: string | null,
  ): Promise<{items: UserEntity[]; total: number}>;
  abstract findById(id: string): Promise<UserEntity>;
  abstract create(dto: CreateUserDto): Promise<UserEntity>;
  abstract delete(id: string): Promise<void>;
  /** PUT: replace every field, or create with this id. */
  abstract replace(
    id: string,
    dto: CreateUserDto,
  ): Promise<{user: UserEntity; created: boolean}>;
  /** PATCH: change only the given fields. */
  abstract patch(
    id: string,
    changes: Partial<Pick<UserEntity, 'name' | 'email' | 'age' | 'phone'>>,
  ): Promise<UserEntity>;
}
