import 'reflect-metadata';
import type https from 'node:https';
import {AppConfig} from '@express-boilerplate/common/config/app.config.js';
import {BeanFactory} from '@express-boilerplate/common/config/bean-factory.js';
import {CacheStore} from '@express-boilerplate/common/config/cache/cache-store.js';
import {CommonConfiguration} from '@express-boilerplate/common/config/common.configuration.js';
import {Metrics} from '@express-boilerplate/common/config/observability/metrics.js';
import {AppLogger} from '@express-boilerplate/common/util/app-logger.js';
import {DataSource} from '@express-boilerplate/persistence/config/database.config.js';
import {PersistenceConfiguration} from '@express-boilerplate/persistence/config/persistence.configuration.js';
import {ServiceConfiguration} from '@express-boilerplate/service/config/service.configuration.js';
import {JobRegistry} from '@express-boilerplate/service/service/job-registry.service.js';
import {InversifyExpressHttpAdapter} from '@inversifyjs/http-express';
import {SwaggerUiProvider} from '@inversifyjs/http-open-api';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import {pinoHttp} from 'pino-http';
import {OpenApiConfig} from './config/openapi.config.js';
import {TcpServer} from './config/transport/tcp.server.js';
import {WebSocketGateway} from './config/transport/websocket.gateway.js';
import {ApiVersioning} from './config/web/api-versioning.js';
import {HttpSemantics} from './config/web/http-semantics.js';
import {RateLimiter} from './config/web/rate-limiter.js';
import {RequestGuards} from './config/web/request-guards.js';
import {
  ActuatorController,
  ProbeController,
} from './controller/actuator.controller.js';
import {AuthenticationController} from './controller/authentication.controller.js';
import {WellKnownController} from './controller/well-known.controller.js';
import {GlobalErrorFilter} from './exceptions/global-exception.filter.js';
import {EventV1Resource} from './rest/resources/v1/event.resource.js';
import {ExperimentV1Resource} from './rest/resources/v1/experiment.resource.js';
import {HealthV1Resource} from './rest/resources/v1/health.resource.js';
import {NetworkV1Resource} from './rest/resources/v1/network.resource.js';
import {QueueV1Resource} from './rest/resources/v1/queue.resource.js';
import {SecureV1Resource} from './rest/resources/v1/secure.resource.js';
import {UserV1Resource} from './rest/resources/v1/user.resource.js';
import {UserV2Resource} from './rest/resources/v2/user.resource.js';

export class Application {
  static readonly controllers = [
    HealthV1Resource,
    UserV1Resource,
    AuthenticationController,
    SecureV1Resource,
    // @feature:experiments
    ExperimentV1Resource,
    // @end:experiments
    UserV2Resource,
    // @feature:sse
    EventV1Resource,
    // @end:sse
    // @feature:network
    NetworkV1Resource,
    // @end:network
    QueueV1Resource,
    WellKnownController,
    ActuatorController,
    ProbeController,
  ];

  readonly beans: BeanFactory;

  constructor(readonly config: AppConfig = new AppConfig()) {
    this.beans = new BeanFactory()
      .registerInstance(AppConfig, config)
      // One configuration per layer; this class is the composition root.
      .register(
        new CommonConfiguration(),
        new PersistenceConfiguration(),
        new ServiceConfiguration(),
      );
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
    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy);
    // Flat query strings only: no nested objects, so no qs prototype tricks.
    app.set('query parser', 'simple');
    // The default CSP everywhere: Swagger UI loads its scripts from /docs, so
    // it needs nothing looser. No HSTS in development: on localhost it makes
    // browsers refuse to click through an untrusted local CA.
    app.use(helmet({strictTransportSecurity: !config.isDevelopment}));
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
    // @feature:metrics
    if (config.env.METRICS_ENABLED) {
      const metrics = this.beans.getBean(Metrics);
      app.use(metrics.middleware());
      // Same network restriction as the ops routes.
      // Also at /actuator/prometheus, beside the other /actuator endpoints.
      for (const path of ['/metrics', '/actuator/prometheus']) {
        app.get(
          path,
          RequestGuards.ipAllowlist(
            config,
            /^\/(metrics|actuator\/prometheus)$/,
          ),
          metrics.handler(),
        );
      }
    }
    // @end:metrics
    app.use(RequestGuards.hostValidation(config));
    app.use(RateLimiter.middleware(config, store));
    app.use(HttpSemantics.options());
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
      RequestGuards.ipAllowlist(
        config,
        /^(\/api\/v\d+\/(queues|network)(\/|$)|\/actuator\/info$)/,
      ),
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
    const built = await adapter.build();
    built.use(HttpSemantics.notFound());
    built.use(HttpSemantics.errorHandler());
    return built;
  }

  // @feature:transports
  /** Everything shares the one TLS server: HTTPS, WebSocket and TCP (ALPN). */
  startTransports(server: https.Server): void {
    // @feature:websocket
    this.beans.getBean(WebSocketGateway).attach(server);
    // @end:websocket
    // @feature:tcp
    this.beans.getBean(TcpServer).attach(server);
    // @end:tcp
  }
  // @end:transports

  async close(server?: https.Server): Promise<void> {
    // @feature:websocket
    await this.beans.getBean(WebSocketGateway).close();
    // @end:websocket
    // @feature:tcp
    this.beans.getBean(TcpServer).close();
    // @end:tcp
    server?.closeAllConnections?.();
    await new Promise<void>((resolve) =>
      server ? server.close(() => resolve()) : resolve(),
    );
    await this.beans.getBean(JobRegistry).close();
    const dataSource = this.beans.getBean(DataSource);
    if (dataSource.isInitialized) await dataSource.destroy();
    await this.beans.getBean(CacheStore).close();
  }

  /** Swagger UI at /docs, development only; the document is OpenApiConfig. */
  private registerSwagger(): void {
    const provider = new SwaggerUiProvider({
      api: {path: '/docs', openApiObject: OpenApiConfig.document(this.config)},
      ui: {title: 'Express Boilerplate API'},
    });
    provider.provide(this.beans.container);
    OpenApiConfig.dropQueryRoutes(provider.openApiObject);
  }
}
