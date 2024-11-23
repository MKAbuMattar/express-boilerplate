import type {IUserResponse, IUsersResponse, User} from '@/api/user/user.model';
import {UserRepository} from '@/api/user/user.repository';
import {logger} from '@/libs/logger.lib';
import {ServiceResponse} from '@/models/service-response.model';
import {StatusCodes} from 'http-status-codes';

export class UserService {
  #UserRepository: UserRepository;

  constructor() {
    this.#UserRepository = new UserRepository();
  }

  async findAll(): Promise<IUsersResponse> {
    try {
      const users = await this.#UserRepository.findAllAsync();
      if (!users || users.length === 0) {
        return ServiceResponse.failure(
          'No Users found',
          null,
          StatusCodes.NOT_FOUND,
        );
      }
      return ServiceResponse.success<User[]>('Users found', users);
    } catch (ex) {
      const errorMessage = `Error finding all users: $${(ex as Error).message}`;
      logger.error(errorMessage);
      return ServiceResponse.failure(
        'An error occurred while retrieving users.',
        null,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findById(id: number): Promise<IUserResponse> {
    try {
      const user = await this.#UserRepository.findByIdAsync(id);
      if (!user) {
        return ServiceResponse.success('User not found', null);
      }
      return ServiceResponse.success<User>('User found', user);
    } catch (ex) {
      const errorMessage = `Error finding user with id ${id}:, ${(ex as Error).message}`;
      logger.error(errorMessage);
      return ServiceResponse.failure(
        'An error occurred while finding user.',
        null,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
