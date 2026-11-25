# Proyecto Parcial 2 — CI/CD, Pruebas Automatizadas y Observabilidad

Sistema web con **Login, CRUD de usuarios y CRUD de productos** (Node.js + Express + SQLite),
desplegado automáticamente en **AWS EC2** con **GitHub Actions** solo cuando pasan las pruebas
(**Vitest** y **Playwright**), e instrumentado con **OpenTelemetry** hacia **OpenObserve**.

| Recurso | URL |
|---|---|
| Aplicación | http://18.225.169.138/ |
| OpenObserve | http://18.225.169.138/openobserve/ |
| Repositorio | https://github.com/TristanLimon/app-devops-api |

## Arquitectura

```
GitHub (push a main)
  └─ GitHub Actions
       ├─ Pruebas backend (Vitest + Supertest, cobertura)
       ├─ Pruebas E2E frontend/backend (Playwright)
       ├─ Registro del resultado en OpenObserve (HTTP/JSON, stream cicd_events)
       ├─ Build y push de la imagen a Docker Hub   ← solo si TODAS las pruebas pasan
       ├─ Despliegue por SSH en EC2 (docker compose) ← solo si TODAS las pruebas pasan
       └─ Registro del evento de despliegue en OpenObserve (o "bloqueado")

AWS EC2 (docker compose, puerto 80)
  nginx ─┬─ /              → app (Express, OpenTelemetry SDK)
         └─ /openobserve/  → OpenObserve
  app ──OTLP──> otel-collector ──OTLP/HTTP──> OpenObserve
  otel-collector (host_metrics) → CPU, RAM, red, disco, carga
  temperature → sensores térmicos del host (si existen)
```

## Observabilidad (OpenObserve)

| Señal | Origen | Stream |
|---|---|---|
| Logs estructurados y excepciones | App (OTLP) | `app_logs` |
| Métricas por endpoint (latencia, peticiones, errores, statusCode) | App (OTLP) | `app_http_*` |
| Trazas distribuidas (HTTP → Express → SQLite) | App (OTLP) | `default` (traces) |
| CPU, RAM, red, disco | Collector `host_metrics` | `system_*` |
| Temperatura | Sidecar `temperature` | `infra_temperature` |
| Ejecuciones del pipeline y despliegues | GitHub Actions | `cicd_events` |

Dashboards creados automáticamente por `deploy/setup_openobserve.py`:
*Aplicación - Endpoints (RF-04)*, *Infraestructura EC2 (RF-05)*, *Pipeline CI/CD (RF-03)*.
Alertas: `errores_5xx_app`, `latencia_alta_app`, `pipeline_fallido`, `cpu_alta_ec2`, `memoria_alta_ec2`
(destino: webhook interno `/api/alerts/webhook`, que registra la alerta en los logs).

## Secretos de GitHub Actions

`DOCKER_HUB_USERNAME`, `DOCKER_HUB_TOKEN`, `EC2_HOST`, `EC2_USERNAME`, `EC2_SSH_KEY`,
`O2_USER`, `O2_PASSWORD`.

## Comandos locales

```bash
npm install
npm run dev              # app en http://localhost:3000
npm run test:coverage    # pruebas backend (Vitest)
npx playwright install chromium
npm run test:e2e         # pruebas E2E (Playwright)
```

Stack completo local (app + OpenObserve + collector):

```bash
docker build -t app-devops-api:local .
cd deploy && docker compose --env-file .env.local up -d
```

## Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login (devuelve JWT) |
| GET | `/api/auth/me` | Usuario autenticado |
| GET/POST | `/api/users` | Listar / crear usuarios |
| GET/PUT/DELETE | `/api/users/:id` | Consultar / editar / eliminar usuario |
| GET/POST | `/api/products` | Listar / crear productos |
| GET/PUT/DELETE | `/api/products/:id` | Consultar / editar / eliminar producto |
| GET | `/api/health` | Estado de la aplicación |
