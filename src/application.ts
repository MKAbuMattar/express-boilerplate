import 'reflect-metadata';
import type {Server} from 'node:http';
import {InversifyExpressHttpAdapter} from '@inversifyjs/http-express';
import {SwaggerUiProvider} from '@inversifyjs/http-open-api';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import {pinoHttp} from 'pino-http';
import {DataSource} from 'typeorm';
import {AppConfig} from './config/app.config.js';
import {AppConfiguration} from './config/app.configuration.js';
import {BeanFactory} from './config/bean-factory.js';
import {CacheStore} from './config/cache/cache-store.js';
import {AuthenticationController} from './controller/authentication.controller.js';
import {WellKnownController} from './controller/well-known.controller.js';
import {GlobalErrorFilter} from './exceptions/global-exception.filter.js';
import {ApiVersioning} from './middleware/api-versioning.js';
import {HttpSemantics} from './middleware/http-semantics.js';
import {RateLimiter} from './middleware/rate-limiter.js';
import {RequestGuards} from './middleware/request-guards.js';
import {EventV1Resource} from './rest/resources/v1/event.resource.js';
import {ExperimentV1Resource} from './rest/resources/v1/experiment.resource.js';
import {HealthV1Resource} from './rest/resources/v1/health.resource.js';
import {NetworkV1Resource} from './rest/resources/v1/network.resource.js';
import {QueueV1Resource} from './rest/resources/v1/queue.resource.js';
import {SecureV1Resource} from './rest/resources/v1/secure.resource.js';
import {UserV1Resource} from './rest/resources/v1/user.resource.js';
import {UserV2Resource} from './rest/resources/v2/user.resource.js';
import {JobRegistry} from './service/job-registry.service.js';
import {TcpServer} from './transport/tcp.server.js';
import {UdpServer} from './transport/udp.server.js';
import {WebSocketGateway} from './transport/websocket.gateway.js';
import {AppLogger} from './util/app-logger.js';

export class Application {
  static readonly controllers = [
    HealthV1Resource,
    UserV1Resource,
    AuthenticationController,
    SecureV1Resource,
    ExperimentV1Resource,
    UserV2Resource,
    EventV1Resource,
    NetworkV1Resource,
    QueueV1Resource,
    WellKnownController,
  ];

  readonly beans: BeanFactory;

  constructor(readonly config: AppConfig = new AppConfig()) {
    this.beans = new BeanFactory()
      .registerInstance(AppConfig, config)
      .register(new AppConfiguration());
    for (const controller of Application.controllers) {
      this.beans.container.bind<object>(controller).toSelf();
    }
  }

  async init(): Promise<express.Application> {
    const {config} = this;
    await this.beans.getBean(DataSource).initialize();
    await this.beans.getBean(CacheStore).connect();
    await this.beans.getBean(JobRegistry).start();

    const app = express();
    let built: express.Application = app;
    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy);
    // Flat query strings only: no nested objects, so no qs prototype tricks.
    app.set('query parser', 'simple');
    // Development: Swagger UI needs inline scripts, and HSTS on localhost
    // makes browsers refuse to click through an untrusted local CA.
    app.use(
      helmet({
        contentSecurityPolicy: config.isDevelopment ? false : {},
        strictTransportSecurity: !config.isDevelopment,
      }),
    );
    app.use(
      compression({
        // Compression buffers output, which would hold back SSE events.
        filter: (request, response) =>
          !String(request.headers.accept).includes('text/event-stream') &&
          compression.filter(request, response),
      }),
    );
    const store = this.beans.getBean(CacheStore);
    const {logger} = this.beans.getBean(AppLogger);
    app.use(HttpSemantics.problemResponses());
    app.use(RequestGuards.requestId());
    app.use(
      pinoHttp({
        logger,
        genReqId: (_request, response) =>
          String(response.getHeader('X-Request-Id')),
      }),
    );
    app.use(RequestGuards.hostValidation(config));
    app.use(RateLimiter.middleware(config, store));
    app.use(HttpSemantics.options(() => built));
    app.use(
      cors({
        origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
        credentials: true,
      }),
    );
    app.use(RequestGuards.crossSite(config));
    app.use(cookieParser(config.env.SESSION_SECRET));
    app.use(HttpSemantics.jsonBodiesOnly());
    // Keep the raw bytes so HmacGuard verifies exactly what the client signed.
    app.use(
      express.json({
        limit: '1mb',
        // application/json plus +json types such as merge-patch+json.
        type: ['application/json', 'application/*+json'],
        verify: (request, _response, buffer) => {
          (request as express.Request).rawBody = buffer;
        },
      }),
    );
    app.use(express.urlencoded({extended: false, limit: '1mb'}));
    app.use(RequestGuards.jsonLimits(config));
    app.use(ApiVersioning.middleware());
    app.use(RequestGuards.cacheControl());
    app.use(RequestGuards.deadline(config));
    app.use(
      RequestGuards.ipAllowlist(config, /^\/api\/v\d+\/(queues|network)(\/|$)/),
    );
    app.use(RequestGuards.auditLog(logger));
    app.use(RequestGuards.idempotency(config, store));

    if (config.isDevelopment) this.registerSwagger();

    const adapter = new InversifyExpressHttpAdapter(
      this.beans.container,
      {logger: false, useJson: false},
      app,
    );
    adapter.useGlobalFilters(GlobalErrorFilter);
    built = await adapter.build();
    built.use(HttpSemantics.notFound(() => built));
    built.use(HttpSemantics.errorHandler());
    return built;
  }

  /** WebSocket shares the HTTP(S) server; TCP and UDP get their own ports. */
  async startTransports(server: Server): Promise<void> {
    this.beans.getBean(WebSocketGateway).attach(server);
    await this.beans.getBean(TcpServer).start();
    await this.beans.getBean(UdpServer).start();
  }

  async close(server?: Server): Promise<void> {
    await this.beans.getBean(WebSocketGateway).close();
    await this.beans.getBean(TcpServer).close();
    await this.beans.getBean(UdpServer).close();
    server?.closeAllConnections?.();
    await new Promise<void>((resolve) =>
      server ? server.close(() => resolve()) : resolve(),
    );
    await this.beans.getBean(JobRegistry).close();
    const dataSource = this.beans.getBean(DataSource);
    if (dataSource.isInitialized) await dataSource.destroy();
    await this.beans.getBean(CacheStore).close();
  }

  private registerSwagger(): void {
    new SwaggerUiProvider({
      api: {
        path: '/docs',
        openApiObject: {
          openapi: '3.1.1',
          info: {title: 'Express Boilerplate', version: '1.0.0'},
          components: {
            securitySchemes: {
              bearerAuth: {type: 'http', scheme: 'bearer', bearerFormat: 'JWT'},
              oauth2: {type: 'http', scheme: 'bearer', bearerFormat: 'JWT'},
              hmac: {type: 'apiKey', in: 'header', name: 'X-Signature'},
            },
          },
        },
      },
      ui: {title: 'Express Boilerplate API'},
    }).provide(this.beans.container);
  }
}
