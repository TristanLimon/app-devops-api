#!/bin/sh
# Lee los sensores térmicos del host (/sys/class/thermal y /sys/class/hwmon)
# y los envía cada 15 s al stream "infra_temperature" de OpenObserve.
# Nota: las instancias EC2 virtualizadas normalmente no exponen sensores;
# en ese caso se registra sensor_disponible=false para dejarlo documentado.
apk add --no-cache curl >/dev/null 2>&1

URL="http://openobserve:5080/openobserve/api/default/infra_temperature/_json"
SYS=/host-sys

while true; do
  RECORDS=""
  for zone in "$SYS"/class/thermal/thermal_zone*; do
    [ -r "$zone/temp" ] || continue
    raw=$(cat "$zone/temp" 2>/dev/null) || continue
    type=$(cat "$zone/type" 2>/dev/null || echo "$(basename "$zone")")
    celsius=$(awk "BEGIN { printf \"%.1f\", $raw / 1000 }")
    RECORDS="$RECORDS{\"host\":\"$HOST_NAME\",\"sensor\":\"$type\",\"temperature_celsius\":$celsius,\"sensor_disponible\":true},"
  done
  for input in "$SYS"/class/hwmon/hwmon*/temp*_input; do
    [ -r "$input" ] || continue
    raw=$(cat "$input" 2>/dev/null) || continue
    dir=$(dirname "$input")
    name=$(cat "$dir/name" 2>/dev/null || echo hwmon)
    celsius=$(awk "BEGIN { printf \"%.1f\", $raw / 1000 }")
    RECORDS="$RECORDS{\"host\":\"$HOST_NAME\",\"sensor\":\"$name-$(basename "$input" _input)\",\"temperature_celsius\":$celsius,\"sensor_disponible\":true},"
  done

  if [ -z "$RECORDS" ]; then
    BODY="[{\"host\":\"$HOST_NAME\",\"sensor\":\"none\",\"sensor_disponible\":false,\"mensaje\":\"La instancia virtual no expone sensores termicos\"}]"
  else
    BODY="[${RECORDS%,}]"
  fi

  curl -s -o /dev/null -X POST "$URL" \
    -H "Authorization: Basic $O2_AUTH" \
    -H "Content-Type: application/json" \
    -d "$BODY" || true
  sleep 15
done
