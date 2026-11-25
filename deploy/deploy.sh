#!/usr/bin/env bash
# Script de despliegue ejecutado en la instancia EC2 por GitHub Actions.
# Variables esperadas: DOCKER_USER, DOCKER_TOKEN, O2_USER, O2_PASSWORD, APP_VERSION
set -euo pipefail
cd "$(dirname "$0")"

for v in DOCKER_USER DOCKER_TOKEN O2_USER O2_PASSWORD APP_VERSION; do
  if [ -z "${!v:-}" ]; then
    echo "ERROR: falta la variable $v (revisa los secretos O2_USER / O2_PASSWORD en GitHub)"; exit 1
  fi
done

echo "==> Preparando servidor"

# Memoria swap (OpenObserve + app + collector en una instancia pequeña)
if ! swapon --show | grep -q '/swapfile'; then
  echo "Creando swap de 2G"
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# Plugin docker compose v2
if ! docker compose version >/dev/null 2>&1; then
  echo "Instalando docker compose"
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  ARCH=$(uname -m)
  sudo curl -sSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${ARCH}" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi
docker compose version

# Variables del stack (el archivo .env no sale del servidor)
O2_AUTH=$(printf '%s:%s' "$O2_USER" "$O2_PASSWORD" | base64 | tr -d '\n')
umask 077
cat > .env <<EOF
APP_IMAGE=${DOCKER_USER}/app-devops-api:${APP_VERSION}
APP_VERSION=${APP_VERSION}
O2_USER=${O2_USER}
O2_PASSWORD=${O2_PASSWORD}
O2_AUTH=${O2_AUTH}
HOST_NAME=ec2-devops
HTTP_PORT=80
EOF
umask 022

echo "==> Descargando imágenes"
echo "$DOCKER_TOKEN" | docker login -u "$DOCKER_USER" --password-stdin
docker compose pull

# Contenedor de la versión anterior (Parcial 1) ocupaba el puerto 80
docker stop devops-api >/dev/null 2>&1 || true
docker rm devops-api >/dev/null 2>&1 || true

echo "==> Levantando contenedores"
docker compose up -d --remove-orphans

echo "==> Esperando a OpenObserve"
for i in $(seq 1 40); do
  if curl -sf -o /dev/null "http://127.0.0.1/openobserve/healthz"; then echo "OpenObserve listo"; break; fi
  sleep 3
done

echo "==> Configurando dashboards y alertas"
if command -v python3 >/dev/null 2>&1; then
  O2_URL=http://127.0.0.1/openobserve O2_USER="$O2_USER" O2_PASSWORD="$O2_PASSWORD" python3 setup_openobserve.py \
    || echo "Aviso: no se pudieron crear todos los dashboards/alertas"
else
  docker run --rm --network host -v "$PWD":/w -w /w -e O2_URL=http://127.0.0.1/openobserve \
    -e O2_USER="$O2_USER" -e O2_PASSWORD="$O2_PASSWORD" python:3.12-alpine python setup_openobserve.py \
    || echo "Aviso: no se pudieron crear todos los dashboards/alertas"
fi

docker image prune -f >/dev/null
docker compose ps
echo "==> Despliegue completado (versión ${APP_VERSION})"
