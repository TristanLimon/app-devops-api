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

# Memoria swap de 1G si la instancia tiene menos de 2 GB de RAM (el disco es pequeño)
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ -f /swapfile ] && [ "$(stat -c %s /swapfile)" -gt 1100000000 ]; then
  echo "Reduciendo swap a 1G para liberar disco"
  sudo swapoff /swapfile || true
  sudo rm -f /swapfile
fi
if [ "$MEM_MB" -lt 2000 ] && ! swapon --show | grep -q '/swapfile'; then
  echo "Creando swap de 1G (RAM: ${MEM_MB} MB)"
  sudo fallocate -l 1G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=1024
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

echo "==> Espacio en disco antes de limpiar"
df -h / | tail -1
# El contenedor de la versión anterior (Parcial 1) se detiene para poder borrar su imagen
docker stop devops-api >/dev/null 2>&1 || true
docker rm devops-api >/dev/null 2>&1 || true
# Libera espacio: contenedores detenidos, imágenes sin uso y caché de build (los volúmenes se conservan)
docker system prune -af >/dev/null 2>&1 || true
sudo journalctl --vacuum-size=100M >/dev/null 2>&1 || true
sudo apt-get clean >/dev/null 2>&1 || true
# Revisiones de snap deshabilitadas ocupan cientos de MB
if command -v snap >/dev/null 2>&1; then
  snap list --all 2>/dev/null | awk '/disabled/{print $1, $3}' | while read -r name rev; do
    sudo snap remove "$name" --revision="$rev" >/dev/null 2>&1 || true
  done
fi
echo "==> Espacio en disco después de limpiar"
df -h / | tail -1

echo "==> Descargando imágenes"
echo "$DOCKER_TOKEN" | docker login -u "$DOCKER_USER" --password-stdin
docker compose pull -q

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
df -h / | tail -1
echo "==> Despliegue completado (versión ${APP_VERSION})"
