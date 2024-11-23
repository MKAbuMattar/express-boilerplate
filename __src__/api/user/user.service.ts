import {StatusCodes} from 'http-status-codes';

import type {User} from '@/api/user/user.model';
import {findAllAsync, findByIdAsync} from '@/api/user/user.repository';
import {logger} from '@/libs/logger.lib';
import {ResponseStatus, ServiceResponse} from '@/models/service-response.model';

export const findAll = async (): Promise<ServiceResponse<User[] | null>> => {
  try {
    const users = await findAllAsync();
    if (!users) {
      return new ServiceResponse(
        ResponseStatus.Failed,
        StatusCodes.NOT_FOUND,
        'No Users found',
        null,
      );
    }
    return new ServiceResponse<User[]>(
      ResponseStatus.Success,
      StatusCodes.OK,
      'Users found',
      users,
    );
  } catch (error) {
    const errorMessage = `Error finding all users: $${(error as Error).message}`;
    logger.error(errorMessage);
    return new ServiceResponse(
      ResponseStatus.Failed,
      StatusCodes.INTERNAL_SERVER_ERROR,
      errorMessage,
      null,
    );
  }
};

export const findById = async (
  id = 0,
): Promise<ServiceResponse<User | null>> => {
  try {
    const user = await findByIdAsync(id);
    if (!user) {
      return new ServiceResponse(
        ResponseStatus.Failed,
        StatusCodes.NOT_FOUND,
        'User not found',
        null,
      );
    }
    return new ServiceResponse<User>(
      ResponseStatus.Success,
      StatusCodes.OK,
      'User found',
      user,
    );
  } catch (error) {
    const errorMessage = `Error finding user with id ${id}:, ${(error as Error).message}`;
    logger.error(errorMessage);
    return new ServiceResponse(
      ResponseStatus.Failed,
      StatusCodes.INTERNAL_SERVER_ERROR,
      errorMessage,
      null,
    );
  }
};
