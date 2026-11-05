import {createRequire} from 'node:module';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http';
import {HttpInstrumentation} from '@opentelemetry/instrumentation-http';
import {resourceFromAttributes} from '@opentelemetry/resources';
import {NodeSDK} from '@opentelemetry/sdk-node';

/**
 * OpenTelemetry tracing, on only when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 * Instruments HTTP in and out: every request becomes a span, and calls to
 * the IdP, JWKS or Vault become child spans. Exports OTLP over HTTP to a
 * collector or straight to Tempo. Standard OTEL_* variables configure it.
 *
 * Start it before the HTTP server is created.
 */
export class Tracing {
  private static sdk?: NodeSDK;

  static start(env: NodeJS.ProcessEnv = process.env): boolean {
    if (!env.OTEL_EXPORTER_OTLP_ENDPOINT || Tracing.sdk) return false;
    Tracing.sdk = new NodeSDK({
      resource: resourceFromAttributes({
        'service.name': env.OTEL_SERVICE_NAME || 'express-boilerplate',
      }),
      traceExporter: new OTLPTraceExporter(),
      instrumentations: [
        new HttpInstrumentation({
          // Probes and scrapes would drown the real traffic.
          ignoreIncomingRequestHook: (request) =>
            /^\/(metrics|api\/(v\d+\/)?health)\b/.test(request.url ?? ''),
        }),
      ],
    });
    Tracing.sdk.start();
    // The SDK patches modules through CommonJS require(). This app is ESM, so
    // its `import http from 'node:http'` never passes that hook. Loading the
    // core modules once through require() applies the patch to the shared
    // module objects, which the ESM default imports point to as well.
    const require = createRequire(import.meta.url);
    require('node:http');
    require('node:https');
    return true;
  }

  /** Flushes buffered spans; call on shutdown. */
  static async stop(): Promise<void> {
    await Tracing.sdk?.shutdown();
    Tracing.sdk = undefined;
  }
}
