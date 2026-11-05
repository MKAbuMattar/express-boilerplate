import type {UserEntity} from '../model/user.entity.js';
import type {CreateUserDto} from '../rest/dto/create-user.dto.js';

/** Contract for user operations. Abstract class, so it exists at runtime as a DI token. */
export abstract class UserService {
  abstract findAll(): Promise<UserEntity[]>;
  abstract findById(id: string): Promise<UserEntity>;
  abstract create(dto: CreateUserDto): Promise<UserEntity>;
  abstract delete(id: string): Promise<void>;
}
