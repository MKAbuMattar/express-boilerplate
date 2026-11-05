import {ApiConstants} from '@express-boilerplate/common/constant/api.constants.js';
import {OpenApiConstants} from '@express-boilerplate/common/constant/openapi.constants.js';
import {ScopeConstants} from '@express-boilerplate/common/constant/scope.constants.js';
import {ApiResponse} from '@express-boilerplate/common/rest/dto/api-response.dto.js';
import {Scopes} from '@express-boilerplate/common/security/authorization/scopes.js';
import {JwtGuard} from '@express-boilerplate/common/security/jwt/jwt.guard.js';
import {CreateUserDto} from '@express-boilerplate/service/dto/create-user.dto.js';
import {UserService} from '@express-boilerplate/service/service/user.service.js';
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
  OasTag,
} from '@inversifyjs/http-open-api';
import {inject} from 'inversify';
import {UserConverter} from '../../../converter/user.converter.js';
import type {UserV1Dto} from '../../dto/v1/user.dto.js';

@Controller(ApiConstants.V1_USERS)
export class UserV1Resource {
  constructor(@inject(UserService) private readonly userService: UserService) {}

  @OasTag('Users v1')

  @OasSummary('List users (public)')
  @OasResponse(
    HttpStatusCode.OK,
    OpenApiConstants.json('Users found', OpenApiConstants.list('UserV1')),
  )
  @Get()
  async getUsers(): Promise<ApiResponse<UserV1Dto[]>> {
    const users = await this.userService.findAll();
    return ApiResponse.ok('Users found', UserConverter.toDtoList(users));
  }

  @OasTag('Users v1')

  @OasSummary('Get a user by id (public)')
  @OasParameter(OpenApiConstants.ID_PATH_PARAM)
  @OasResponse(
    HttpStatusCode.OK,
    OpenApiConstants.json('User found', OpenApiConstants.ref('UserV1')),
  )
  @OasResponse(
    HttpStatusCode.NOT_FOUND,
    OpenApiConstants.problem('User not found'),
  )
  @Get('/:id')
  async getUser(
    @Params({name: 'id'}) id: string,
  ): Promise<ApiResponse<UserV1Dto>> {
    const user = await this.userService.findById(id);
    return ApiResponse.ok('User found', UserConverter.toDto(user));
  }

  @OasTag('Users v1')

  @OasSummary('Create a user (JWT)')
  @OasRequestBody(OpenApiConstants.CREATE_USER_BODY)
  @OasResponse(
    HttpStatusCode.CREATED,
    OpenApiConstants.json('User created', OpenApiConstants.ref('UserV1')),
  )
  @OasResponse(
    HttpStatusCode.BAD_REQUEST,
    OpenApiConstants.problem('Validation failed'),
  )
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.problem('Missing or invalid JWT'),
  )
  @OasResponse(
    HttpStatusCode.CONFLICT,
    OpenApiConstants.problem('Email already in use'),
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

  @OasTag('Users v1')

  @OasSummary('Delete a user (JWT)')
  @OasParameter(OpenApiConstants.ID_PATH_PARAM)
  @OasResponse(HttpStatusCode.NO_CONTENT, OpenApiConstants.NO_CONTENT)
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.problem('Missing or invalid JWT'),
  )
  @OasResponse(
    HttpStatusCode.NOT_FOUND,
    OpenApiConstants.problem('User not found'),
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
