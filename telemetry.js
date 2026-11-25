// Instrumentación OpenTelemetry (OTLP) -> OTel Collector -> OpenObserve
// Se carga antes que la app con: node --import ./telemetry.js server.js
import { register } from 'node:module';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { resourceFromAttributes } from '@opentelemetry/resources';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  // Hook necesario para instrumentar módulos ESM (express, http)
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'app-devops-api',
    resource: resourceFromAttributes({
      'service.version': process.env.APP_VERSION || 'dev',
      'deployment.environment': process.env.NODE_ENV || 'development',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis: 15000,
      }),
    ],
    logRecordProcessors: [
      new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${endpoint}/v1/logs` }) }),
    ],
    instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
  });

  sdk.start();
  console.log(JSON.stringify({ level: 'info', msg: `OpenTelemetry activo -> ${endpoint}` }));

  const shutdown = () => sdk.shutdown().finally(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
