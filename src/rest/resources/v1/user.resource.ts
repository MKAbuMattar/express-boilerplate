import {
  Body,
  Controller,
  CreatedHttpResponse,
  Delete,
  Get,
  HttpStatusCode,
  NoContentHttpResponse,
  Params,
  Post,
  UseGuard,
} from '@inversifyjs/http-core';
import {
  OasParameter,
  OasRequestBody,
  OasResponse,
  OasSecurity,
  OasSummary,
} from '@inversifyjs/http-open-api';
import {inject} from 'inversify';
import {ApiConstants} from '../../../constant/api.constants.js';
import {OpenApiConstants} from '../../../constant/openapi.constants.js';
import {ScopeConstants} from '../../../constant/scope.constants.js';
import {UserConverter} from '../../../converter/user.converter.js';
import {Scopes} from '../../../security/authorization/scopes.js';
import {JwtGuard} from '../../../security/jwt/jwt.guard.js';
import {UserService} from '../../../service/user.service.js';
import {ApiResponse} from '../../dto/api-response.dto.js';
import {CreateUserDto} from '../../dto/create-user.dto.js';
import type {UserV1Dto} from '../../dto/v1/user.dto.js';

@Controller(ApiConstants.V1_USERS)
export class UserV1Resource {
  constructor(@inject(UserService) private readonly userService: UserService) {}

  @OasSummary('List users (public)')
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('Users found'))
  @Get()
  async getUsers(): Promise<ApiResponse<UserV1Dto[]>> {
    const users = await this.userService.findAll();
    return ApiResponse.ok('Users found', UserConverter.toDtoList(users));
  }

  @OasSummary('Get a user by id (public)')
  @OasParameter(OpenApiConstants.ID_PATH_PARAM)
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('User found'))
  @OasResponse(
    HttpStatusCode.NOT_FOUND,
    OpenApiConstants.json('User not found'),
  )
  @Get('/:id')
  async getUser(
    @Params({name: 'id'}) id: string,
  ): Promise<ApiResponse<UserV1Dto>> {
    const user = await this.userService.findById(id);
    return ApiResponse.ok('User found', UserConverter.toDto(user));
  }

  @OasSummary('Create a user (JWT)')
  @OasRequestBody(OpenApiConstants.CREATE_USER_BODY)
  @OasResponse(HttpStatusCode.CREATED, OpenApiConstants.json('User created'))
  @OasResponse(
    HttpStatusCode.BAD_REQUEST,
    OpenApiConstants.json('Validation failed'),
  )
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.json('Missing or invalid JWT'),
  )
  @OasResponse(
    HttpStatusCode.CONFLICT,
    OpenApiConstants.json('Email already in use'),
  )
  @OasSecurity({bearerAuth: []})
  @UseGuard(JwtGuard, Scopes.require(ScopeConstants.USERS_WRITE))
  @Post()
  async createUser(@Body() body: unknown): Promise<CreatedHttpResponse> {
    const user = await this.userService.create(CreateUserDto.from(body));
    return new CreatedHttpResponse(
      ApiResponse.ok('User created', UserConverter.toDto(user)),
    );
  }

  @OasSummary('Delete a user (JWT)')
  @OasParameter(OpenApiConstants.ID_PATH_PARAM)
  @OasResponse(HttpStatusCode.NO_CONTENT, OpenApiConstants.NO_CONTENT)
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.json('Missing or invalid JWT'),
  )
  @OasResponse(
    HttpStatusCode.NOT_FOUND,
    OpenApiConstants.json('User not found'),
  )
  @OasSecurity({bearerAuth: []})
  @UseGuard(JwtGuard, Scopes.require(ScopeConstants.USERS_WRITE))
  @Delete('/:id')
  async deleteUser(
    @Params({name: 'id'}) id: string,
  ): Promise<NoContentHttpResponse> {
    await this.userService.delete(id);
    return new NoContentHttpResponse();
  }
}
