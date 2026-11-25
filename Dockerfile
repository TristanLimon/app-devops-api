FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

ARG APP_VERSION=dev
ENV PORT=3000 \
    NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    DB_PATH=/app/data/database.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# telemetry.js se carga antes que la app para instrumentar express/http con OpenTelemetry
CMD ["node", "--import", "./telemetry.js", "server.js"]
