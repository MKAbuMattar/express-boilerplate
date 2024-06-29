import {StatusCodes} from 'http-status-codes';

// User Controller
import {User} from '@/api/user/user.model';
import {userRepository} from '@/api/user/user.repository';
// Models
import {ResponseStatus, ServiceResponse} from '@/models/service-response.model';
import {logger} from '@/server';

export const userService = {
  // Retrieves all users from the database
  findAll: async (): Promise<ServiceResponse<User[] | null>> => {
    try {
      const users = await userRepository.findAllAsync();
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
  },

  // Retrieves a single user by their ID
  findById: async (id: number): Promise<ServiceResponse<User | null>> => {
    try {
      const user = await userRepository.findByIdAsync(id);
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
  },
};
