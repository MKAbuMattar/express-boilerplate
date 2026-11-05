import {
  Body,
  Controller,
  CreatedHttpResponse,
  Delete,
  Get,
  NoContentHttpResponse,
  Params,
  Post,
  UseGuard,
} from '@inversifyjs/http-core';
import {OasSecurity, OasSummary} from '@inversifyjs/http-open-api';
import {inject} from 'inversify';
import {ApiConstants} from '../../constant/api.constants.js';
import {UserConverter} from '../../converter/user.converter.js';
import {JwtGuard} from '../../security/jwt/jwt.guard.js';
import {UserService} from '../../service/user.service.js';
import {ApiResponse} from '../dto/api-response.dto.js';
import {CreateUserDto} from '../dto/create-user.dto.js';
import type {UserDto} from '../dto/user.dto.js';

@Controller(ApiConstants.API_USERS)
export class UserResource {
  constructor(@inject(UserService) private readonly userService: UserService) {}

  @OasSummary('List users (public)')
  @Get()
  async getUsers(): Promise<ApiResponse<UserDto[]>> {
    const users = await this.userService.findAll();
    return ApiResponse.ok('Users found', UserConverter.toDtoList(users));
  }

  @OasSummary('Get a user by id (public)')
  @Get('/:id')
  async getUser(
    @Params({name: 'id'}) id: string,
  ): Promise<ApiResponse<UserDto>> {
    const user = await this.userService.findById(id);
    return ApiResponse.ok('User found', UserConverter.toDto(user));
  }

  @OasSummary('Create a user (JWT)')
  @OasSecurity({bearerAuth: []})
  @UseGuard(JwtGuard)
  @Post()
  async createUser(@Body() body: unknown): Promise<CreatedHttpResponse> {
    const user = await this.userService.create(CreateUserDto.from(body));
    return new CreatedHttpResponse(
      ApiResponse.ok('User created', UserConverter.toDto(user)),
    );
  }

  @OasSummary('Delete a user (JWT)')
  @OasSecurity({bearerAuth: []})
  @UseGuard(JwtGuard)
  @Delete('/:id')
  async deleteUser(
    @Params({name: 'id'}) id: string,
  ): Promise<NoContentHttpResponse> {
    await this.userService.delete(id);
    return new NoContentHttpResponse();
  }
}
