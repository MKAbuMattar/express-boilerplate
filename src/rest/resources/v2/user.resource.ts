import {
  All,
  Body,
  Controller,
  CreatedHttpResponse,
  Delete,
  ErrorHttpResponse,
  Get,
  Headers,
  HttpStatusCode,
  NoContentHttpResponse,
  OkHttpResponse,
  Params,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuard,
} from '@inversifyjs/http-core';
import {
  OasParameter,
  OasRequestBody,
  OasResponse,
  OasSecurity,
  OasSummary,
} from '@inversifyjs/http-open-api';
import type {Request as ExpressRequest} from 'express';
import {inject} from 'inversify';
import {ApiConstants} from '../../../constant/api.constants.js';
import {OpenApiConstants} from '../../../constant/openapi.constants.js';
import {UserConverter} from '../../../converter/user.converter.js';
import {JwtGuard} from '../../../security/jwt/jwt.guard.js';
import {UserService} from '../../../service/user.service.js';
import {ApiResponse} from '../../dto/api-response.dto.js';
import {CreateUserDto} from '../../dto/create-user.dto.js';
import {PageDto, PageRequestDto} from '../../dto/v2/page.dto.js';
import type {UserV2Dto} from '../../dto/v2/user.dto.js';
import {UserPatchDto} from '../../dto/v2/user-patch.dto.js';
import {Preconditions} from '../../preconditions.js';

/**
 * API v2 users: paged and searchable list, the phone field from the
 * AddUserPhone migration, and every method with its RFC 9110 meaning:
 *
 * | Method | Does                          | Safe | Idempotent |
 * |--------|-------------------------------|------|------------|
 * | GET    | read (304 on If-None-Match)   | yes  | yes        |
 * | QUERY  | search with a body            | yes  | yes        |
 * | POST   | create, server picks the id   | no   | no         |
 * | PUT    | replace all, or create at id  | no   | yes        |
 * | PATCH  | change some fields            | no   | no         |
 * | DELETE | remove                        | no   | yes        |
 *
 * Writes honour If-Match (412 when the ETag is stale).
 */
@Controller(ApiConstants.V2_USERS)
export class UserV2Resource {
  constructor(@inject(UserService) private readonly userService: UserService) {}

  @OasSummary('List users, paged and searchable (public)')
  @OasParameter({
    name: 'page',
    in: 'query',
    schema: {type: 'integer', minimum: 1, default: 1},
  })
  @OasParameter({
    name: 'size',
    in: 'query',
    schema: {type: 'integer', minimum: 1, maximum: 100, default: 20},
  })
  @OasParameter({
    name: 'search',
    in: 'query',
    description: 'Substring of name or email',
    schema: {type: 'string', maxLength: 100},
  })
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('A page of users'))
  @OasResponse(
    HttpStatusCode.BAD_REQUEST,
    OpenApiConstants.json('Invalid paging'),
  )
  @Get()
  async getUsers(
    @Query() query: Record<string, unknown>,
  ): Promise<ApiResponse<PageDto<UserV2Dto>>> {
    const request = PageRequestDto.from(query);
    const {items, total} = await this.userService.findPage(
      request.page,
      request.size,
      request.search,
    );
    return ApiResponse.ok(
      'Users found',
      new PageDto(
        items.map((user) => UserConverter.toV2Dto(user)),
        request.page,
        request.size,
        total,
      ),
    );
  }

  @OasSummary('QUERY: search with criteria in the body (safe, idempotent)')
  @OasRequestBody({
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            search: {type: 'string'},
            page: {type: 'integer'},
            size: {type: 'integer'},
          },
        },
      },
    },
  })
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('A page of users'))
  @All('/search')
  async query(
    @Request() request: ExpressRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<PageDto<UserV2Dto>>> {
    if (request.method !== 'QUERY') {
      throw new ErrorHttpResponse(
        HttpStatusCode.METHOD_NOT_ALLOWED,
        ApiResponse.fail(`${request.method} is not supported here`),
        undefined,
        undefined,
        {Allow: 'QUERY'},
      );
    }
    const criteria =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)
        : {};
    return this.getUsers(criteria);
  }

  @OasSummary('Get a user by id (public)')
  @OasParameter(OpenApiConstants.ID_PATH_PARAM)
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('User found'))
  @OasResponse(
    HttpStatusCode.NOT_FOUND,
    OpenApiConstants.json('User not found'),
  )
  @Get('/:id')
  async getUser(@Params({name: 'id'}) id: string): Promise<OkHttpResponse> {
    const user = await this.userService.findById(id);
    // Express answers 304 itself when If-None-Match equals this ETag.
    return new OkHttpResponse(
      ApiResponse.ok('User found', UserConverter.toV2Dto(user)),
      {ETag: UserConverter.etag(user)},
    );
  }

  @OasSummary('Create a user with an optional phone (JWT)')
  @OasSecurity({bearerAuth: []})
  @OasRequestBody(OpenApiConstants.CREATE_USER_V2_BODY)
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
  @UseGuard(JwtGuard)
  @Post()
  async createUser(@Body() body: unknown): Promise<CreatedHttpResponse> {
    const user = await this.userService.create(CreateUserDto.fromV2(body));
    return new CreatedHttpResponse(
      ApiResponse.ok('User created', UserConverter.toV2Dto(user)),
    );
  }

  @OasSummary('Replace a user, or create it at this id (JWT, idempotent)')
  @OasSecurity({bearerAuth: []})
  @OasParameter(OpenApiConstants.ID_PATH_PARAM)
  @OasRequestBody(OpenApiConstants.CREATE_USER_V2_BODY)
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('User replaced'))
  @OasResponse(HttpStatusCode.CREATED, OpenApiConstants.json('User created'))
  @OasResponse(
    HttpStatusCode.PRECONDITION_FAILED,
    OpenApiConstants.json('ETag mismatch'),
  )
  @UseGuard(JwtGuard)
  @Put('/:id')
  async replaceUser(
    @Params({name: 'id'}) id: string,
    @Body() body: unknown,
    @Headers({name: 'if-match'}) ifMatch: string | undefined,
    @Headers({name: 'if-none-match'}) ifNoneMatch: string | undefined,
  ): Promise<OkHttpResponse | CreatedHttpResponse> {
    const dto = CreateUserDto.fromV2(body);
    Preconditions.check(await this.currentEtag(id), ifMatch, ifNoneMatch);
    const {user, created} = await this.userService.replace(id, dto);
    const payload = ApiResponse.ok(
      created ? 'User created' : 'User replaced',
      UserConverter.toV2Dto(user),
    );
    const etag = UserConverter.etag(user);
    return created
      ? new CreatedHttpResponse(payload, {
          ETag: etag,
          Location: `${ApiConstants.V2_USERS}/${user.id}`,
        })
      : new OkHttpResponse(payload, {ETag: etag});
  }

  @OasSummary('Change some fields of a user (JWT)')
  @OasSecurity({bearerAuth: []})
  @OasParameter(OpenApiConstants.ID_PATH_PARAM)
  @OasRequestBody({
    content: {
      'application/merge-patch+json': {
        schema: {type: 'object', example: {age: 43, phone: null}},
      },
    },
  })
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('User updated'))
  @OasResponse(
    HttpStatusCode.NOT_FOUND,
    OpenApiConstants.json('User not found'),
  )
  @OasResponse(
    HttpStatusCode.PRECONDITION_FAILED,
    OpenApiConstants.json('ETag mismatch'),
  )
  @UseGuard(JwtGuard)
  @Patch('/:id')
  async patchUser(
    @Params({name: 'id'}) id: string,
    @Body() body: unknown,
    @Headers({name: 'if-match'}) ifMatch: string | undefined,
  ): Promise<OkHttpResponse> {
    const {changes} = UserPatchDto.from(body);
    Preconditions.check(await this.currentEtag(id), ifMatch, undefined);
    const user = await this.userService.patch(id, changes);
    return new OkHttpResponse(
      ApiResponse.ok('User updated', UserConverter.toV2Dto(user)),
      {ETag: UserConverter.etag(user)},
    );
  }

  @OasSummary('Delete a user (JWT, idempotent)')
  @OasSecurity({bearerAuth: []})
  @OasParameter(OpenApiConstants.ID_PATH_PARAM)
  @OasResponse(HttpStatusCode.NO_CONTENT, OpenApiConstants.NO_CONTENT)
  @OasResponse(
    HttpStatusCode.NOT_FOUND,
    OpenApiConstants.json('User not found'),
  )
  @UseGuard(JwtGuard)
  @Delete('/:id')
  async deleteUser(
    @Params({name: 'id'}) id: string,
    @Headers({name: 'if-match'}) ifMatch: string | undefined,
  ): Promise<NoContentHttpResponse> {
    Preconditions.check(await this.currentEtag(id), ifMatch, undefined);
    await this.userService.delete(id);
    return new NoContentHttpResponse();
  }

  private async currentEtag(id: string): Promise<string | null> {
    try {
      return UserConverter.etag(await this.userService.findById(id));
    } catch {
      return null;
    }
  }
}
