import {
  ConflictHttpResponse,
  NotFoundHttpResponse,
} from '@inversifyjs/http-core';
import {inject} from 'inversify';
import {Service} from '../../config/stereotypes.js';
import {CacheConstants} from '../../constant/cache.constants.js';
import type {UserEntity} from '../../model/user.entity.js';
import {UserRepository} from '../../repository/user.repository.js';
import {ApiResponse} from '../../rest/dto/api-response.dto.js';
import type {CreateUserDto} from '../../rest/dto/create-user.dto.js';
import {
  type CacheAware,
  Cacheable,
  CacheEvict,
} from '../../util/cache.decorators.js';
import {CacheService} from '../cache.service.js';
import {UserService} from '../user.service.js';

@Service()
export class UserServiceImpl extends UserService implements CacheAware {
  constructor(
    @inject(UserRepository) private readonly userRepository: UserRepository,
    @inject(CacheService) readonly cache: CacheService,
  ) {
    super();
  }

  @Cacheable(() => CacheConstants.USERS_ALL)
  findAll(): Promise<UserEntity[]> {
    return this.userRepository.findAll();
  }

  @Cacheable((id: string) => CacheConstants.user(id))
  async findById(id: string): Promise<UserEntity> {
    return this.require(await this.userRepository.findById(id));
  }

  @CacheEvict(() => CacheConstants.USERS_ALL)
  async create(dto: CreateUserDto): Promise<UserEntity> {
    if (await this.userRepository.findByEmail(dto.email)) {
      throw new ConflictHttpResponse(ApiResponse.fail('Email already in use'));
    }
    return this.userRepository.save(dto);
  }

  @CacheEvict(
    () => CacheConstants.USERS_ALL,
    (id: string) => CacheConstants.user(id),
  )
  async delete(id: string): Promise<void> {
    // Load from the repository, not findById: remove() needs a real entity.
    await this.userRepository.remove(
      this.require(await this.userRepository.findById(id)),
    );
  }

  private require(user: UserEntity | null): UserEntity {
    if (!user) {
      throw new NotFoundHttpResponse(ApiResponse.fail('User not found'));
    }
    return user;
  }
}
