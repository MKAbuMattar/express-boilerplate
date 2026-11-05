import type {
  OpenApi3Dot1ParameterObject,
  OpenApi3Dot1RequestBodyObject,
  OpenApi3Dot1ResponseObject,
  OpenApi3Dot1SchemaObject,
} from '@inversifyjs/open-api-types/v3Dot1';

/** Reusable OpenAPI blocks. Swagger UI shows no response panel without them. */
export class OpenApiConstants {
  static readonly ENVELOPE: OpenApi3Dot1SchemaObject = {
    type: 'object',
    properties: {
      success: {type: 'boolean'},
      message: {type: 'string'},
      data: {},
    },
  };

  static json(description: string): OpenApi3Dot1ResponseObject {
    return {
      description,
      content: {'application/json': {schema: OpenApiConstants.ENVELOPE}},
    };
  }

  static readonly NO_CONTENT: OpenApi3Dot1ResponseObject = {
    description: 'No content',
  };

  static readonly REDIRECT: OpenApi3Dot1ResponseObject = {
    description: 'Redirect (Location header)',
  };

  static readonly XML: OpenApi3Dot1ResponseObject = {
    description: 'SAML service provider metadata',
    content: {'application/xml': {schema: {type: 'string'}}},
  };

  static readonly QUEUE_PATH_PARAM: OpenApi3Dot1ParameterObject = {
    name: 'name',
    in: 'path',
    required: true,
    schema: {type: 'string', enum: ['welcome-email', 'demo']},
  };

  static readonly ID_PATH_PARAM: OpenApi3Dot1ParameterObject = {
    name: 'id',
    in: 'path',
    required: true,
    schema: {type: 'string'},
  };

  static header(
    name: string,
    description: string,
  ): OpenApi3Dot1ParameterObject {
    return {
      name,
      in: 'header',
      required: true,
      description,
      schema: {type: 'string'},
    };
  }

  static readonly CREATE_USER_BODY: OpenApi3Dot1RequestBodyObject = {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['name', 'email', 'age'],
          properties: {
            name: {type: 'string', example: 'Alice'},
            email: {
              type: 'string',
              format: 'email',
              example: 'alice@example.com',
            },
            age: {type: 'integer', minimum: 0, maximum: 150, example: 42},
          },
        },
      },
    },
  };

  static readonly CREATE_USER_V2_BODY: OpenApi3Dot1RequestBodyObject = {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['name', 'email', 'age'],
          properties: {
            name: {type: 'string', example: 'Alice'},
            email: {
              type: 'string',
              format: 'email',
              example: 'alice@example.com',
            },
            age: {type: 'integer', minimum: 0, maximum: 150, example: 42},
            phone: {type: 'string', example: '+962 7 9123 4567'},
          },
        },
      },
    },
  };

  static readonly ANY_JSON_BODY: OpenApi3Dot1RequestBodyObject = {
    content: {
      'application/json': {schema: {type: 'object', example: {amount: 10}}},
    },
  };
}
