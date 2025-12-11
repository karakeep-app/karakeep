# OpenTelemetry Integration Plan for Karakeep

## Executive Summary

This document outlines a comprehensive plan to integrate OpenTelemetry (OTel) into Karakeep, a monorepo application with multiple services (API, Workers, Web, CLI, Mobile). The integration will provide distributed tracing, enhanced metrics correlation, and improved observability across the entire stack.

**Current State:**
- ✅ Prometheus metrics already implemented
- ✅ Winston-based structured logging
- ✅ Middleware architecture ready for instrumentation
- ❌ No distributed tracing
- ❌ No cross-service transaction visibility
- ❌ No automatic instrumentation for external calls

**Goals:**
- Enable distributed tracing across API → Workers → Database → External Services
- Correlate logs, metrics, and traces with unified context
- Provide visibility into long-running background jobs
- Instrument database queries automatically
- Monitor external service calls (OpenAI, webhooks, RSS feeds)
- Enable performance profiling and optimization

---

## Architecture Overview

### OpenTelemetry Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenTelemetry Collector                      │
│  (Optional: For batching, filtering, routing)                   │
└────────────┬────────────────────────────────────────────────────┘
             │
             ├──────────────┬──────────────┬──────────────┐
             ▼              ▼              ▼              ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
    │   Jaeger   │  │ Prometheus │  │    Loki    │  │   Tempo    │
    │  (Traces)  │  │ (Metrics)  │  │   (Logs)   │  │  (Traces)  │
    └────────────┘  └────────────┘  └────────────┘  └────────────┘
```

### Instrumented Services

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Next.js    │────▶│   API/tRPC   │────▶│   Workers    │
│   Web App    │     │    (Hono)    │     │   (Queues)   │
└──────────────┘     └──────┬───────┘     └──────┬───────┘
                            │                     │
                            ├─────────────────────┤
                            ▼                     ▼
                     ┌─────────────────────────────────┐
                     │    SQLite (Drizzle ORM)         │
                     └─────────────────────────────────┘

                     External Services:
                     - OpenAI API
                     - Webhook Delivery
                     - RSS Feeds
                     - S3 Storage
                     - SMTP
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Foundation)
**Estimated Effort:** 2-3 days
**Priority:** CRITICAL

#### 1.1 Package Setup
- [ ] Create `packages/opentelemetry` shared package
- [ ] Install dependencies:
  ```json
  {
    "@opentelemetry/sdk-node": "^0.49.0",
    "@opentelemetry/api": "^1.8.0",
    "@opentelemetry/instrumentation": "^0.49.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.49.0",
    "@opentelemetry/exporter-metrics-otlp-http": "^0.49.0",
    "@opentelemetry/resources": "^1.22.0",
    "@opentelemetry/semantic-conventions": "^1.22.0"
  }
  ```

#### 1.2 Configuration Schema
Add to `/packages/shared/config.ts`:
```typescript
// OpenTelemetry Configuration
OTEL_ENABLED: z.coerce.boolean().default(false),
OTEL_SERVICE_NAME: z.string().optional(),
OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318'),
OTEL_EXPORTER_OTLP_PROTOCOL: z.enum(['http/protobuf', 'http/json', 'grpc']).default('http/protobuf'),
OTEL_TRACES_SAMPLER: z.enum(['always_on', 'always_off', 'traceidratio', 'parentbased_always_on']).default('parentbased_always_on'),
OTEL_TRACES_SAMPLER_ARG: z.coerce.number().min(0).max(1).default(1.0),
OTEL_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(), // For auth: "Authorization=Bearer token"
```

#### 1.3 Base Telemetry Module
Create `/packages/opentelemetry/index.ts`:
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion: string;
  enabled: boolean;
  endpoint: string;
  environment: string;
}

export function initTelemetry(config: TelemetryConfig): NodeSDK | null {
  if (!config.enabled) {
    return null;
  }

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: config.serviceVersion,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.environment,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false }, // Too noisy
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown().finally(() => process.exit(0));
  });

  return sdk;
}
```

---

### Phase 2: API Service Instrumentation
**Estimated Effort:** 3-4 days
**Priority:** HIGH

#### 2.1 Automatic HTTP Instrumentation
**Location:** `/packages/api/index.ts`

Install:
```bash
pnpm add @opentelemetry/instrumentation-http @opentelemetry/instrumentation-hono
```

Initialize before app creation:
```typescript
import { initTelemetry } from '@karakeep/opentelemetry';
import { getConfig } from '@karakeep/shared/config';

const config = getConfig();
const sdk = initTelemetry({
  serviceName: 'karakeep-api',
  serviceVersion: config.SERVER_VERSION,
  enabled: config.OTEL_ENABLED,
  endpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT,
  environment: config.NODE_ENV,
});
```

#### 2.2 tRPC Custom Instrumentation
**Location:** `/packages/trpc/index.ts`

Create middleware to wrap tRPC procedures:
```typescript
import { trace, SpanStatusCode, context } from '@opentelemetry/api';

const tracer = trace.getTracer('karakeep-trpc');

const telemetryMiddleware = t.middleware(async (opts) => {
  const span = tracer.startSpan(`trpc.${opts.type}.${opts.path}`, {
    attributes: {
      'rpc.system': 'trpc',
      'rpc.method': opts.path,
      'rpc.service': 'karakeep',
    },
  });

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await opts.next();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      throw error;
    } finally {
      span.end();
    }
  });
});

// Add to base procedure
export const baseProcedure = t.procedure
  .use(telemetryMiddleware)
  .use(isDemoMode)
  .use(metricsMiddleware);
```

#### 2.3 Database Instrumentation
**Location:** `/packages/db/drizzle.ts`

Create custom Drizzle logger with OTel:
```typescript
import { trace } from '@opentelemetry/api';
import { Logger } from 'drizzle-orm/logger';

class TelemetryLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    const tracer = trace.getTracer('karakeep-db');
    const span = tracer.startSpan('db.query', {
      attributes: {
        'db.system': 'sqlite',
        'db.statement': query,
        'db.operation': this.extractOperation(query),
      },
    });

    // Log to Winston as well
    logger.debug('Database query', { query, params });

    span.end();
  }

  private extractOperation(query: string): string {
    const match = query.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i);
    return match ? match[1].toLowerCase() : 'unknown';
  }
}

export const db = drizzle(sqlite, {
  schema: schema,
  logger: new TelemetryLogger(),
});
```

#### 2.4 Authentication Context Propagation
**Location:** `/packages/api/middlewares/auth.ts`

Add user context to spans:
```typescript
import { trace } from '@opentelemetry/api';

export const authed = (options?: AuthMiddlewareOptions) => async (c: Context, next: Next) => {
  // ... existing auth logic ...

  if (user) {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttributes({
        'user.id': user.id,
        'user.role': user.role,
        'enduser.id': user.id, // Semantic convention
      });
    }
  }

  await next();
};
```

---

### Phase 3: Workers Instrumentation
**Estimated Effort:** 4-5 days
**Priority:** HIGH

#### 3.1 Worker Process Initialization
**Location:** `/apps/workers/index.ts`

Initialize telemetry per worker:
```typescript
import { initTelemetry } from '@karakeep/opentelemetry';

const sdk = initTelemetry({
  serviceName: 'karakeep-workers',
  serviceVersion: serverVersion,
  enabled: config.OTEL_ENABLED,
  endpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT,
  environment: config.NODE_ENV,
});
```

#### 3.2 Queue Job Tracing
**Location:** `/packages/shared-server/src/queues.ts`

Wrap job execution with spans:
```typescript
import { trace, context, propagation } from '@opentelemetry/api';

export class BaseQueue<T> {
  async dequeue(): Promise<DequeuedJob<T> | null> {
    const job = await this.rawDequeue();
    if (!job) return null;

    const tracer = trace.getTracer('karakeep-queue');

    // Extract trace context from job metadata (if queued with context)
    const parentContext = job.traceContext
      ? propagation.extract(context.active(), job.traceContext)
      : context.active();

    return context.with(parentContext, () => {
      const span = tracer.startSpan(`queue.job.${this.queueName}`, {
        attributes: {
          'messaging.system': 'karakeep-queue',
          'messaging.destination': this.queueName,
          'messaging.operation': 'process',
          'messaging.message_id': job.id,
          'job.priority': job.priority,
          'job.run_number': job.runNumber,
        },
      });

      return {
        ...job,
        span, // Attach span to job for worker access
      };
    });
  }
}
```

#### 3.3 Worker-Specific Instrumentation

**Crawler Worker** (`/apps/workers/workers/crawlerWorker.ts`):
```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

async run(job: DequeuedJob<LinkCrawlerRequest>) {
  const tracer = trace.getTracer('karakeep-crawler');
  const span = tracer.startSpan('crawler.crawl_url', {
    attributes: {
      'http.url': job.data.url,
      'crawler.user_agent': 'karakeep',
    },
  });

  try {
    // ... crawling logic ...

    span.setAttributes({
      'http.status_code': response.status,
      'http.response_content_length': response.contentLength,
    });

    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end();
  }
}
```

**OpenAI Worker** (`/apps/workers/workers/inferenceWorker.ts`):
```typescript
import { trace } from '@opentelemetry/api';

async run(job: DequeuedJob<OpenAIRequest>) {
  const tracer = trace.getTracer('karakeep-inference');
  const span = tracer.startSpan('ai.inference', {
    attributes: {
      'ai.model.provider': job.data.provider, // 'openai' or 'ollama'
      'ai.model.name': job.data.model,
      'ai.operation': job.data.operation, // 'summarize', 'tag', etc.
    },
  });

  try {
    const result = await this.callAI(job.data);

    span.setAttributes({
      'ai.response.tokens': result.usage?.total_tokens,
      'ai.response.finish_reason': result.finish_reason,
    });

    return result;
  } finally {
    span.end();
  }
}
```

**Video Worker** - Track video download progress
**Feed Worker** - Track RSS fetch and parsing
**Webhook Worker** - Track webhook delivery and retries

#### 3.4 Long-Running Job Monitoring
Add periodic span events for long jobs:
```typescript
async run(job: DequeuedJob<T>) {
  const span = trace.getActiveSpan();

  // Emit progress events
  job.onProgress((progress) => {
    span?.addEvent('job.progress', {
      'progress.percent': progress.percent,
      'progress.step': progress.step,
    });
  });
}
```

---

### Phase 4: External Service Instrumentation
**Estimated Effort:** 2-3 days
**Priority:** MEDIUM

#### 4.1 HTTP Client Instrumentation
Install auto-instrumentation for common libraries:
```bash
pnpm add @opentelemetry/instrumentation-http
pnpm add @opentelemetry/instrumentation-fetch  # For node-fetch
```

These will automatically instrument:
- RSS feed fetching
- Webhook delivery
- OpenAI API calls
- S3 operations (if using AWS SDK)

#### 4.2 Manual Instrumentation for Custom Clients
**Webhooks** (`/packages/trpc/routers/webhooks.ts`):
```typescript
import { trace } from '@opentelemetry/api';

async function deliverWebhook(webhook: Webhook, payload: unknown) {
  const tracer = trace.getTracer('karakeep-webhooks');
  const span = tracer.startSpan('webhook.deliver', {
    attributes: {
      'webhook.id': webhook.id,
      'webhook.url': webhook.url,
      'webhook.event': payload.event,
    },
  });

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Karakeep-Signature': generateSignature(payload, webhook.secret),
      },
      body: JSON.stringify(payload),
    });

    span.setAttributes({
      'http.status_code': response.status,
      'webhook.success': response.ok,
    });

    return response;
  } finally {
    span.end();
  }
}
```

---

### Phase 5: Logging Integration
**Estimated Effort:** 1-2 days
**Priority:** MEDIUM

#### 5.1 Winston-OpenTelemetry Bridge
**Location:** `/packages/shared/logger.ts`

Correlate logs with traces:
```typescript
import { trace, context } from '@opentelemetry/api';
import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf((info) => {
    const span = trace.getActiveSpan();
    const spanContext = span?.spanContext();

    const logEntry = {
      timestamp: info.timestamp,
      level: info.level,
      message: info.message,
      ...(spanContext && {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
        trace_flags: spanContext.traceFlags,
      }),
      ...info,
    };

    return JSON.stringify(logEntry);
  })
);

export const logger = winston.createLogger({
  level: serverConfig.LOG_LEVEL,
  format: logFormat,
  transports: [new winston.transports.Console()],
});
```

This enables log-trace correlation in observability platforms.

---

### Phase 6: Frontend Instrumentation (Optional)
**Estimated Effort:** 3-4 days
**Priority:** LOW

#### 6.1 Web Vitals and User Monitoring
**Location:** `/apps/web/app/layout.tsx`

Install:
```bash
pnpm add @opentelemetry/sdk-trace-web @opentelemetry/instrumentation-document-load @opentelemetry/instrumentation-user-interaction
```

Initialize:
```typescript
'use client';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_OTEL_ENABLED === 'true') {
  const provider = new WebTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'karakeep-web',
    }),
  });

  provider.addSpanProcessor(new BatchSpanProcessor(/* OTLP exporter */));
  provider.register();

  // Auto-instrument page loads and user interactions
  registerInstrumentations({
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new UserInteractionInstrumentation(),
    ],
  });
}
```

#### 6.2 tRPC Client Instrumentation
Track tRPC calls from browser to API:
```typescript
import { trace } from '@opentelemetry/api';

const trpc = createTRPCProxyClient({
  links: [
    // Add telemetry link
    (runtime) => {
      return ({ op, next }) => {
        const tracer = trace.getTracer('karakeep-trpc-client');
        const span = tracer.startSpan(`trpc.client.${op.type}.${op.path}`);

        return context.with(trace.setSpan(context.active(), span), async () => {
          try {
            const result = await next(op);
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
          } catch (error) {
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
          } finally {
            span.end();
          }
        });
      };
    },
    httpBatchLink({ url: '/api/trpc' }),
  ],
});
```

---

### Phase 7: Metrics Bridge (Prometheus ↔ OTel)
**Estimated Effort:** 1-2 days
**Priority:** MEDIUM

#### 7.1 Dual Export Strategy
Keep existing Prometheus metrics while adding OTel:

**Option A: Export Prometheus metrics via OTel Collector**
```yaml
# otel-collector-config.yaml
receivers:
  prometheus:
    config:
      scrape_configs:
        - job_name: 'karakeep-api'
          static_configs:
            - targets: ['localhost:3000']
          metrics_path: '/metrics'
          bearer_token: '${PROMETHEUS_AUTH_TOKEN}'

exporters:
  prometheus:
    endpoint: "0.0.0.0:9090"
  otlp:
    endpoint: "tempo:4317"

service:
  pipelines:
    metrics:
      receivers: [prometheus]
      exporters: [prometheus, otlp]
```

**Option B: Use OTel SDK Metrics + Prometheus Exporter**
```typescript
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/sdk-metrics';

const exporter = new PrometheusExporter({
  port: 9464, // Separate port from existing /metrics endpoint
});

const meterProvider = new MeterProvider({
  readers: [exporter],
});
```

#### 7.2 Migrate Custom Metrics to OTel
Gradually replace `prom-client` metrics with OTel equivalents:

**Before:**
```typescript
import { Counter } from 'prom-client';
const counter = new Counter({ name: 'karakeep_trpc_requests_total' });
counter.inc();
```

**After:**
```typescript
import { trace } from '@opentelemetry/api';
const meter = trace.getMeterProvider().getMeter('karakeep');
const counter = meter.createCounter('trpc.requests', {
  description: 'Total tRPC requests',
});
counter.add(1, { path: op.path });
```

---

## Configuration Management

### Environment Variables
Add to `/.env.sample`:
```bash
# OpenTelemetry Configuration
OTEL_ENABLED=false
OTEL_SERVICE_NAME=karakeep
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_TRACES_SAMPLER=parentbased_always_on
OTEL_TRACES_SAMPLER_ARG=1.0
OTEL_LOG_LEVEL=info

# Optional: For authenticated collectors
# OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer YOUR_TOKEN
```

### Docker Compose Setup
Create `/docker/otel-collector.yaml`:
```yaml
version: '3.8'

services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - "4318:4318"   # OTLP HTTP receiver
      - "4317:4317"   # OTLP gRPC receiver
      - "8888:8888"   # Prometheus metrics
      - "13133:13133" # Health check

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686" # Jaeger UI
      - "14250:14250" # Jaeger gRPC

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - ./grafana/datasources.yaml:/etc/grafana/provisioning/datasources/datasources.yaml
```

### Kubernetes ConfigMap
Create `/kubernetes/otel-config.yaml`:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: karakeep-otel-config
data:
  OTEL_ENABLED: "true"
  OTEL_SERVICE_NAME: "karakeep"
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318"
  OTEL_TRACES_SAMPLER: "parentbased_traceidratio"
  OTEL_TRACES_SAMPLER_ARG: "0.1"  # Sample 10% in production
```

---

## Performance Considerations

### Sampling Strategies

**Development:**
```bash
OTEL_TRACES_SAMPLER=always_on  # Trace everything
```

**Staging:**
```bash
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.5  # Sample 50%
```

**Production:**
```bash
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1  # Sample 10%
```

**Custom Sampling for Important Endpoints:**
```typescript
import { Sampler, SamplingDecision } from '@opentelemetry/sdk-trace-base';

class AdaptiveSampler implements Sampler {
  shouldSample(context, traceId, spanName, spanKind, attributes) {
    // Always sample errors
    if (attributes['http.status_code'] >= 400) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Always sample slow requests
    if (attributes['http.duration'] > 1000) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Sample admin requests at 100%
    if (spanName.includes('admin')) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Default to 10% sampling
    return { decision: SamplingDecision.RECORD_AND_SAMPLED };
  }
}
```

### Batching and Export
```typescript
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

const spanProcessor = new BatchSpanProcessor(exporter, {
  maxQueueSize: 2048,
  maxExportBatchSize: 512,
  scheduledDelayMillis: 5000,  // Export every 5 seconds
});
```

### Resource Limits
Monitor overhead:
- CPU: OTel SDK typically adds <5% overhead
- Memory: ~50-100MB per instrumented process
- Network: ~1-10KB per span (depends on attributes)

---

## Testing Strategy

### Unit Tests
Test instrumentation without exporting:
```typescript
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';

describe('tRPC Telemetry', () => {
  let exporter: InMemorySpanExporter;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    // Initialize SDK with in-memory exporter
  });

  it('should create spans for tRPC calls', async () => {
    await trpc.bookmarks.list.query();

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('trpc.query.bookmarks.list');
    expect(spans[0].attributes['rpc.system']).toBe('trpc');
  });
});
```

### Integration Tests
Test end-to-end tracing:
```typescript
describe('Distributed Tracing', () => {
  it('should propagate trace context from API to Worker', async () => {
    // Make API request that queues a job
    const response = await fetch('/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com' }),
    });

    // Wait for worker to process
    await waitForJobCompletion();

    // Verify trace spans form a connected graph
    const spans = await getTraceById(traceId);
    expect(spans).toHaveLength(3); // API span + Queue span + Worker span
    expect(spans[1].parentSpanId).toBe(spans[0].spanId);
    expect(spans[2].parentSpanId).toBe(spans[1].spanId);
  });
});
```

### Load Testing
Verify telemetry overhead:
```bash
# Baseline (no telemetry)
OTEL_ENABLED=false pnpm benchmark

# With telemetry
OTEL_ENABLED=true OTEL_TRACES_SAMPLER=always_on pnpm benchmark

# Compare results
```

---

## Monitoring and Dashboards

### Key Metrics to Track

**Service Health:**
- Request rate (requests/sec)
- Error rate (%)
- P50, P95, P99 latency
- Trace sampling rate

**Worker Performance:**
- Jobs processed/sec per queue
- Job success/failure rate
- Average job duration
- Queue depth

**Database:**
- Query rate
- Slow queries (>100ms)
- Connection pool usage

**External Services:**
- OpenAI API latency
- Webhook delivery success rate
- RSS feed fetch errors

### Grafana Dashboard Example
```json
{
  "title": "Karakeep Observability",
  "panels": [
    {
      "title": "Request Rate by Service",
      "targets": [{
        "expr": "rate(http_server_duration_count[5m])",
        "legendFormat": "{{service_name}}"
      }]
    },
    {
      "title": "Error Rate",
      "targets": [{
        "expr": "rate(http_server_duration_count{http_status_code=~\"5..\"}[5m])"
      }]
    },
    {
      "title": "Trace Latency Heatmap",
      "type": "heatmap",
      "dataFormat": "tsbuckets"
    }
  ]
}
```

### Alerts
```yaml
# Prometheus alerts
groups:
  - name: karakeep_tracing
    rules:
      - alert: HighTraceErrorRate
        expr: rate(traces{status_code="ERROR"}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High error rate in traces"

      - alert: SlowDatabaseQueries
        expr: histogram_quantile(0.95, rate(db_query_duration_bucket[5m])) > 1.0
        for: 10m
        annotations:
          summary: "95th percentile DB queries > 1s"
```

---

## Migration Path

### Week 1: Foundation
- [ ] Create `packages/opentelemetry` package
- [ ] Add configuration schema
- [ ] Set up local OTel Collector + Jaeger
- [ ] Initialize telemetry in API (disabled by default)

### Week 2: Core Instrumentation
- [ ] Instrument tRPC procedures
- [ ] Add database query tracing
- [ ] Add HTTP middleware instrumentation
- [ ] Test trace propagation

### Week 3: Workers
- [ ] Initialize telemetry in workers
- [ ] Instrument queue jobs
- [ ] Add worker-specific spans (crawler, inference, etc.)
- [ ] Test cross-service tracing (API → Worker)

### Week 4: External Services
- [ ] Instrument OpenAI calls
- [ ] Instrument webhook delivery
- [ ] Instrument RSS fetching
- [ ] Add retry/timeout tracking

### Week 5: Logging & Metrics
- [ ] Integrate Winston with OTel (trace correlation)
- [ ] Bridge Prometheus metrics
- [ ] Create Grafana dashboards
- [ ] Set up alerts

### Week 6: Production Rollout
- [ ] Deploy to staging with sampling
- [ ] Load test and tune sampling rates
- [ ] Document runbooks
- [ ] Roll out to production (10% sampling)

---

## Rollout Strategy

### 1. Feature Flag Approach
```typescript
// Gradual rollout by user percentage
const shouldTrace = (userId: string) => {
  if (!config.OTEL_ENABLED) return false;

  const hash = hashCode(userId);
  const rolloutPercent = config.OTEL_ROLLOUT_PERCENT; // 0-100
  return (hash % 100) < rolloutPercent;
};
```

### 2. Environment-Based Rollout
```
Development → OTEL_ENABLED=true, 100% sampling
Staging     → OTEL_ENABLED=true, 50% sampling
Production  → OTEL_ENABLED=true, 10% sampling (week 1)
            → OTEL_ENABLED=true, 25% sampling (week 2)
            → OTEL_ENABLED=true, 50% sampling (week 3)
            → OTEL_ENABLED=true, 100% sampling (week 4+)
```

### 3. Service-by-Service Rollout
1. **API** - Enable first (most traffic, easiest to monitor)
2. **Workers** - Enable after API is stable
3. **Web** - Enable browser tracing last (optional)

---

## Troubleshooting Guide

### Common Issues

**Issue: Traces not appearing in Jaeger**
- Check `OTEL_ENABLED=true`
- Verify `OTEL_EXPORTER_OTLP_ENDPOINT` is reachable
- Check collector logs: `docker logs otel-collector`
- Verify sampling is not set to `always_off`

**Issue: High memory usage**
- Reduce batch size: `maxExportBatchSize: 256`
- Increase export interval: `scheduledDelayMillis: 10000`
- Lower sampling rate: `OTEL_TRACES_SAMPLER_ARG=0.01`

**Issue: Missing spans in trace**
- Verify context propagation between services
- Check that async operations use `context.with()`
- Ensure spans are ended in `finally` blocks

**Issue: Duplicate spans**
- Check for overlapping auto-instrumentation
- Disable redundant instrumentations
- Use `enabled: false` for noisy instrumentations

---

## Security Considerations

### Sensitive Data Redaction
```typescript
import { Span } from '@opentelemetry/api';

function sanitizeAttributes(attributes: Record<string, any>) {
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'authorization'];

  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => {
      if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
        return [key, '[REDACTED]'];
      }
      return [key, value];
    })
  );
}

// Use in span creation
span.setAttributes(sanitizeAttributes(attributes));
```

### Authentication for Exporters
```bash
# For authenticated backends (e.g., Honeycomb, Lightstep)
OTEL_EXPORTER_OTLP_HEADERS="x-honeycomb-team=YOUR_API_KEY"
```

### PII/GDPR Compliance
- Don't include user emails, IPs, or personal data in span attributes
- Use user IDs (hashed if necessary)
- Configure attribute limits: `spanAttributeCountLimit: 128`

---

## Cost Estimation

### Data Volume (Estimated)

**Traces:**
- API: ~100 req/s × 60s × 60m × 24h = 8.6M spans/day
- Workers: ~10 jobs/s × 60s × 60m × 24h = 864K spans/day
- Total: ~9.5M spans/day

**Storage (at 1KB/span):**
- Daily: 9.5 GB
- Monthly: 285 GB
- Yearly: 3.4 TB

**With 10% Sampling:**
- Monthly: 28.5 GB
- Yearly: 342 GB

### Infrastructure Costs

**Self-Hosted (Recommended):**
- OTel Collector: 1 CPU, 2GB RAM (~$20/mo)
- Jaeger/Tempo: 2 CPU, 4GB RAM (~$40/mo)
- Storage (S3): 50 GB/mo (~$2/mo)
- **Total: ~$62/mo**

**SaaS (Alternative):**
- Honeycomb: ~$200-500/mo (depending on volume)
- Datadog: ~$500-1000/mo
- Lightstep: ~$300-600/mo

---

## Success Metrics

### Phase 1 (Foundation) - Success Criteria
- [ ] OTel SDK initialized without errors
- [ ] Traces exported to Jaeger
- [ ] <1% performance overhead measured

### Phase 2 (API) - Success Criteria
- [ ] 100% of HTTP requests traced
- [ ] tRPC procedures have spans with correct attributes
- [ ] Database queries visible in traces
- [ ] User context propagated to spans

### Phase 3 (Workers) - Success Criteria
- [ ] All queue jobs traced
- [ ] Parent-child relationship between API and Worker spans
- [ ] Long-running jobs have progress events
- [ ] External service calls instrumented

### Final Success Metrics
- [ ] Mean time to detect (MTTD) issues: <5 minutes
- [ ] Mean time to resolve (MTTR): <30 minutes
- [ ] 95% of requests have complete traces
- [ ] <5% CPU overhead from telemetry
- [ ] Developer adoption: >80% use traces for debugging

---

## References and Resources

### Documentation
- [OpenTelemetry JS Docs](https://opentelemetry.io/docs/instrumentation/js/)
- [Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- [Hono + OTel Example](https://github.com/honojs/examples/tree/main/opentelemetry)

### Tools
- [Jaeger](https://www.jaegertracing.io/) - Trace visualization
- [Tempo](https://grafana.com/oss/tempo/) - Trace storage
- [OTel Collector](https://opentelemetry.io/docs/collector/) - Telemetry pipeline

### Community
- [OTel Slack](https://cloud-native.slack.com/) - #opentelemetry channel
- [CNCF OTel SIG](https://github.com/open-telemetry/community)

---

## Appendix: Example Trace

### Expected Trace Structure
```
POST /api/bookmarks (trace_id: abc123)
├─ trpc.mutation.bookmarks.create [150ms]
│  ├─ db.query.INSERT bookmarks [20ms]
│  ├─ queue.enqueue.link_crawler [5ms]
│  └─ db.query.UPDATE users [10ms]
│
└─ queue.job.link_crawler [2.5s]
   ├─ crawler.fetch_url [2.0s]
   │  └─ http.client.GET [1.8s]
   ├─ ai.inference.summarize [400ms]
   │  └─ http.client.POST openai [380ms]
   └─ db.query.UPDATE bookmarks [30ms]
```

### Attributes Example
```json
{
  "trace_id": "abc123def456",
  "span_id": "span123",
  "parent_span_id": "parent456",
  "name": "trpc.mutation.bookmarks.create",
  "kind": "SERVER",
  "start_time": 1234567890,
  "end_time": 1234568040,
  "attributes": {
    "rpc.system": "trpc",
    "rpc.method": "bookmarks.create",
    "rpc.service": "karakeep",
    "user.id": "user_123",
    "user.role": "user",
    "http.method": "POST",
    "http.url": "/api/trpc/bookmarks.create",
    "http.status_code": 200,
    "db.queries": 2
  },
  "events": [
    {
      "name": "validation.success",
      "timestamp": 1234567895
    }
  ],
  "status": {
    "code": "OK"
  }
}
```

---

**End of Plan**

For questions or clarifications, refer to:
- Technical lead: [To be assigned]
- Documentation: `/docs/observability/opentelemetry.md` (to be created)
- Issues: GitHub Issues with label `observability`
