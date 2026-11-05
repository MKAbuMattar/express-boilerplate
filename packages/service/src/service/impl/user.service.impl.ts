import {Service} from '@express-boilerplate/common/config/stereotypes.js';
import {CacheConstants} from '@express-boilerplate/common/constant/cache.constants.js';
import {ApiResponse} from '@express-boilerplate/common/rest/dto/api-response.dto.js';
import {CacheService} from '@express-boilerplate/common/service/cache.service.js';
import {
  type CacheAware,
  Cacheable,
  CacheEvict,
} from '@express-boilerplate/common/util/cache.decorators.js';
import type {UserEntity} from '@express-boilerplate/persistence/model/user.entity.js';
import {UserRepository} from '@express-boilerplate/persistence/repository/user.repository.js';
import {
  BadRequestHttpResponse,
  ConflictHttpResponse,
  NotFoundHttpResponse,
} from '@inversifyjs/http-core';
import {inject} from 'inversify';
import type {CreateUserDto} from '../../dto/create-user.dto.js';
import {AppEvent} from '../../model/app-event.js';
import {EventBus} from '../event-bus.service.js';
import {UserService} from '../user.service.js';

@Service()
export class UserServiceImpl extends UserService implements CacheAware {
  constructor(
    @inject(UserRepository) private readonly userRepository: UserRepository,
    @inject(CacheService) readonly cache: CacheService,
    @inject(EventBus) private readonly eventBus: EventBus,
  ) {
    super();
  }

  @Cacheable(() => CacheConstants.USERS_ALL)
  findAll(): Promise<UserEntity[]> {
    return this.userRepository.findAll();
  }

  findPage(
    page: number,
    size: number,
    search: string | null,
  ): Promise<{items: UserEntity[]; total: number}> {
    return this.userRepository.findPage(page, size, search);
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
    const user = await this.userRepository.save(dto);
    this.eventBus.publish(new AppEvent('user.created', {id: String(user.id)}));
    return user;
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
    this.eventBus.publish(new AppEvent('user.deleted', {id}));
  }

  @CacheEvict(
    () => CacheConstants.USERS_ALL,
    (id: string) => CacheConstants.user(id),
  )
  async replace(
    id: string,
    dto: CreateUserDto,
  ): Promise<{user: UserEntity; created: boolean}> {
    await this.ensureEmailFree(dto.email, id);
    const fields = {
      name: dto.name,
      email: dto.email,
      age: dto.age,
      phone: dto.phone,
    };
    const existing = await this.userRepository.findById(id);
    if (existing) {
      const user = await this.userRepository.update(existing, fields);
      this.eventBus.publish(new AppEvent('user.updated', {id}));
      return {user, created: false};
    }
    if (!this.userRepository.isValidId(id)) {
      throw new BadRequestHttpResponse(
        ApiResponse.fail('Validation failed', {
          id: 'must be a valid id to create',
        }),
      );
    }
    const user = await this.userRepository.saveWithId(id, fields);
    this.eventBus.publish(new AppEvent('user.created', {id}));
    return {user, created: true};
  }

  @CacheEvict(
    () => CacheConstants.USERS_ALL,
    (id: string) => CacheConstants.user(id),
  )
  async patch(
    id: string,
    changes: Partial<Pick<UserEntity, 'name' | 'email' | 'age' | 'phone'>>,
  ): Promise<UserEntity> {
    const existing = this.require(await this.userRepository.findById(id));
    if (changes.email !== undefined)
      await this.ensureEmailFree(changes.email, id);
    const user = await this.userRepository.update(existing, changes);
    this.eventBus.publish(new AppEvent('user.updated', {id}));
    return user;
  }

  private async ensureEmailFree(email: string, ownerId: string): Promise<void> {
    const holder = await this.userRepository.findByEmail(email);
    if (holder && String(holder.id) !== ownerId) {
      throw new ConflictHttpResponse(ApiResponse.fail('Email already in use'));
    }
  }

  private require(user: UserEntity | null): UserEntity {
    if (!user) {
      throw new NotFoundHttpResponse(ApiResponse.fail('User not found'));
    }
    return user;
  }
}
