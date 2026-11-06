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

  /** Reusable schemas, published under components.schemas. */
  static readonly SCHEMAS: Record<string, OpenApi3Dot1SchemaObject> = {
    Problem: {
      type: 'object',
      description: 'RFC 9457 problem details, used by every 4xx and 5xx.',
      required: ['type', 'title', 'status'],
      properties: {
        type: {type: 'string', example: 'about:blank'},
        title: {type: 'string', example: 'Bad Request'},
        status: {type: 'integer', example: 400},
        detail: {type: 'string', example: 'Validation failed'},
        instance: {type: 'string', example: '/api/v2/users'},
        requestId: {
          type: 'string',
          description: 'Same as the X-Request-Id header',
        },
        success: {type: 'boolean', const: false},
        message: {
          type: 'string',
          description: 'Same as detail (envelope compatibility)',
        },
        data: {
          type: ['object', 'null'],
          description: 'Field errors on 400, else null',
          additionalProperties: {type: 'string'},
        },
      },
    },
    UserV1: {
      type: 'object',
      required: ['id', 'name', 'email', 'age', 'createdAt', 'updatedAt'],
      properties: {
        id: {type: 'string', example: '1677725a-0232-408a-a993-753c3cd6728c'},
        name: {type: 'string', example: 'Alice'},
        email: {type: 'string', format: 'email', example: 'alice@example.com'},
        age: {type: 'integer', minimum: 0, maximum: 150, example: 42},
        createdAt: {type: 'string', format: 'date-time'},
        updatedAt: {type: 'string', format: 'date-time'},
      },
    },
    UserV2: {
      allOf: [
        {$ref: '#/components/schemas/UserV1'},
        {
          type: 'object',
          required: ['phone'],
          properties: {
            phone: {type: ['string', 'null'], example: '+962 79 123 4567'},
          },
        },
      ],
    },
    UserPage: {
      type: 'object',
      required: ['items', 'page', 'size', 'total', 'pages'],
      properties: {
        items: {type: 'array', items: {$ref: '#/components/schemas/UserV2'}},
        page: {type: 'integer', minimum: 1},
        size: {type: 'integer', minimum: 1, maximum: 100},
        total: {type: 'integer', minimum: 0},
        pages: {type: 'integer', minimum: 0},
      },
    },
    UserPatch: {
      type: 'object',
      minProperties: 1,
      additionalProperties: false,
      description: 'Only the fields to change; phone null clears it.',
      properties: {
        name: {type: 'string', minLength: 1, maxLength: 120},
        email: {type: 'string', format: 'email', maxLength: 254},
        age: {type: 'integer', minimum: 0, maximum: 150},
        phone: {type: ['string', 'null']},
      },
    },
    Principal: {
      type: 'object',
      description: 'The authenticated caller.',
      properties: {
        strategy: {
          enum: [
            // @feature:auth-mtls
            'mtls',
            // @end:auth-mtls
            // @feature:auth-hmac
            'hmac',
            // @end:auth-hmac
            'jwt',
            // @feature:auth-oauth2
            'oauth2',
            // @end:auth-oauth2
            // @feature:auth-oidc
            'oidc',
            // @end:auth-oidc
            // @feature:auth-saml
            'saml',
            // @end:auth-saml
          ],
        },
        subject: {type: 'string'},
        claims: {type: 'object', additionalProperties: true},
      },
    },
    HealthV1: {
      type: 'object',
      properties: {
        database: {type: 'string', example: 'postgres'},
        cache: {type: 'string', example: 'memory'},
      },
    },
    ActuatorHealth: {
      type: 'object',
      description: 'Health of the service and its dependencies.',
      properties: {
        status: {enum: ['UP', 'DOWN', 'OUT_OF_SERVICE', 'UNKNOWN']},
        components: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              status: {enum: ['UP', 'DOWN', 'OUT_OF_SERVICE', 'UNKNOWN']},
              details: {type: 'object', additionalProperties: true},
            },
          },
        },
      },
    },
    // @feature:experiments
    Variant: {
      type: 'object',
      properties: {
        experiment: {type: 'string', example: 'new-checkout'},
        variant: {enum: ['A', 'B']},
      },
    },
    // @end:experiments
    // @feature:network
    PingResult: {
      type: 'object',
      properties: {
        host: {type: 'string'},
        reachable: {type: 'boolean'},
        latencyMs: {type: ['number', 'null']},
      },
    },
    // @end:network
    JobAccepted: {
      type: 'object',
      properties: {jobId: {type: 'string'}},
    },
    DeadLetter: {
      type: 'object',
      properties: {
        id: {type: 'string'},
        queue: {type: 'string'},
        payload: {type: 'object', additionalProperties: true},
        error: {type: 'string'},
        attempts: {type: 'integer'},
        failedAt: {type: 'string', format: 'date-time'},
      },
    },
    JwkSet: {
      type: 'object',
      properties: {
        keys: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kty: {type: 'string'},
              crv: {type: 'string'},
              x: {type: 'string'},
              y: {type: 'string'},
              kid: {type: 'string'},
              alg: {type: 'string'},
              use: {type: 'string'},
            },
          },
        },
      },
    },
  };

  static ref(name: string): OpenApi3Dot1SchemaObject {
    return {$ref: `#/components/schemas/${name}`};
  }

  static list(name: string): OpenApi3Dot1SchemaObject {
    return {type: 'array', items: OpenApiConstants.ref(name)};
  }

  /** 2xx in the {success, message, data} envelope, with data typed. */
  static json(
    description: string,
    data: OpenApi3Dot1SchemaObject = {},
  ): OpenApi3Dot1ResponseObject {
    return {
      description,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: {type: 'boolean', const: true},
              message: {type: 'string'},
              data,
            },
          },
        },
      },
    };
  }

  /** 4xx/5xx: RFC 9457 problem details. */
  static problem(description: string): OpenApi3Dot1ResponseObject {
    return {
      description,
      content: {
        'application/problem+json': {schema: OpenApiConstants.ref('Problem')},
      },
    };
  }

  /** A body that is not in the envelope (JWKS, Actuator, SSE). */
  static raw(
    description: string,
    mediaType: string,
    schema: OpenApi3Dot1SchemaObject,
  ): OpenApi3Dot1ResponseObject {
    return {description, content: {[mediaType]: {schema}}};
  }

  static readonly NO_CONTENT: OpenApi3Dot1ResponseObject = {
    description: 'No content',
  };

  // @feature:sso
  static readonly REDIRECT: OpenApi3Dot1ResponseObject = {
    description: 'Redirect (Location header)',
  };
  // @end:sso

  // @feature:auth-saml
  static readonly XML: OpenApi3Dot1ResponseObject = {
    description: 'SAML service provider metadata',
    content: {'application/xml': {schema: {type: 'string'}}},
  };
  // @end:auth-saml

  static readonly QUEUE_PATH_PARAM: OpenApi3Dot1ParameterObject = {
    name: 'name',
    in: 'path',
    required: true,
    schema: {
      type: 'string',
      enum: [
        // @feature:mail
        'welcome-email',
        // @end:mail
        'demo',
      ],
    },
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
