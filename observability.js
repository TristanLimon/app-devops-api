// Logs estructurados, métricas HTTP por endpoint y spans de base de datos.
// Si OpenTelemetry no está iniciado (pruebas locales) las APIs son no-op.
import { logs, metrics, trace, SeverityNumber, SpanStatusCode, SpanKind } from '@opentelemetry/api';

const SERVICE = 'app-devops-api';
const otelLogger = logs.getLogger(SERVICE);
const meter = metrics.getMeter(SERVICE);
const tracer = trace.getTracer(SERVICE);
const quiet = process.env.NODE_ENV === 'test';

const SEVERITY = {
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

export const logger = {
  log(level, msg, attrs = {}) {
    const record = { timestamp: new Date().toISOString(), level, msg, ...attrs };
    if (!quiet) console.log(JSON.stringify(record));
    otelLogger.emit({
      severityNumber: SEVERITY[level] ?? SeverityNumber.INFO,
      severityText: level.toUpperCase(),
      body: msg,
      attributes: attrs,
    });
  },
  info(msg, attrs) { this.log('info', msg, attrs); },
  warn(msg, attrs) { this.log('warn', msg, attrs); },
  error(msg, attrs) { this.log('error', msg, attrs); },
};

// ---------- Métricas por endpoint ----------
const requestCounter = meter.createCounter('app_http_requests_total', {
  description: 'Total de peticiones HTTP por endpoint, método y statusCode',
});
const errorCounter = meter.createCounter('app_http_errors_total', {
  description: 'Peticiones HTTP con statusCode >= 400',
});
const latencyHistogram = meter.createHistogram('app_http_request_duration_ms', {
  description: 'Latencia de las peticiones HTTP en milisegundos',
  unit: 'ms',
});

export function httpMetricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const route = req.route ? `${req.baseUrl}${req.route.path}` : (req.path.startsWith('/api') ? 'unmatched' : 'static');
    const attrs = {
      'http.route': route,
      'http.method': req.method,
      'http.status_code': res.statusCode,
    };
    requestCounter.add(1, attrs);
    latencyHistogram.record(durationMs, attrs);
    if (res.statusCode >= 400) errorCounter.add(1, attrs);

    if (route !== 'static') {
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger.log(level, `${req.method} ${req.originalUrl} ${res.statusCode}`, {
        route,
        method: req.method,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        user: req.user?.email || 'anonimo',
      });
    }
  });
  next();
}

// ---------- Spans de base de datos ----------
export function dbSpan(operation, sql, fn) {
  return tracer.startActiveSpan(`sqlite ${operation}`, { kind: SpanKind.CLIENT }, (span) => {
    span.setAttribute('db.system', 'sqlite');
    span.setAttribute('db.operation', operation);
    span.setAttribute('db.statement', sql);
    try {
      const result = fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  });
}

// Helpers que envuelven better-sqlite3 con un span por consulta
export function makeQuery(db) {
  const op = (sql) => sql.trim().split(/\s+/)[0].toUpperCase();
  return {
    all: (sql, ...params) => dbSpan(op(sql), sql, () => db.prepare(sql).all(...params)),
    get: (sql, ...params) => dbSpan(op(sql), sql, () => db.prepare(sql).get(...params)),
    run: (sql, ...params) => dbSpan(op(sql), sql, () => db.prepare(sql).run(...params)),
  };
}
