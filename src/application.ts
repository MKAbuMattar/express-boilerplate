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
import {GlobalErrorFilter} from './exceptions/global-exception.filter.js';
import {ApiResponse} from './rest/dto/api-response.dto.js';
import {HealthResource} from './rest/resources/health.resource.js';
import {SecureResource} from './rest/resources/secure.resource.js';
import {UserResource} from './rest/resources/user.resource.js';
import {AppLogger} from './util/app-logger.js';

export class Application {
  static readonly controllers = [
    HealthResource,
    UserResource,
    AuthenticationController,
    SecureResource,
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

    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', config.env.TRUST_PROXY);
    // Development: Swagger UI needs inline scripts, and HSTS on localhost
    // makes browsers refuse to click through an untrusted local CA.
    app.use(
      helmet({
        contentSecurityPolicy: config.isDevelopment ? false : {},
        strictTransportSecurity: !config.isDevelopment,
      }),
    );
    app.use(compression());
    app.use(
      cors({
        origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
        credentials: true,
      }),
    );
    app.use(cookieParser(config.env.SESSION_SECRET));
    // Keep the raw bytes so HmacGuard verifies exactly what the client signed.
    app.use(
      express.json({
        limit: '1mb',
        verify: (request, _response, buffer) => {
          (request as express.Request).rawBody = buffer;
        },
      }),
    );
    app.use(express.urlencoded({extended: false, limit: '1mb'}));
    app.use(pinoHttp({logger: this.beans.getBean(AppLogger).logger}));

    if (config.isDevelopment) this.registerSwagger();

    const adapter = new InversifyExpressHttpAdapter(
      this.beans.container,
      {logger: false, useJson: false},
      app,
    );
    adapter.useGlobalFilters(GlobalErrorFilter);
    const built = await adapter.build();
    built.use((_request: express.Request, response: express.Response) => {
      response.status(404).json(ApiResponse.fail('Not Found'));
    });
    return built;
  }

  async close(server?: Server): Promise<void> {
    await new Promise<void>((resolve) =>
      server ? server.close(() => resolve()) : resolve(),
    );
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
