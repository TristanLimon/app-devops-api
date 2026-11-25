#!/usr/bin/env python3
"""Crea (o recrea) en OpenObserve los dashboards, el destino webhook y las alertas
del proyecto. Es idempotente: se ejecuta en cada despliegue.

Variables de entorno: O2_URL (default http://127.0.0.1/openobserve), O2_USER, O2_PASSWORD
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

O2_URL = os.environ.get("O2_URL", "http://127.0.0.1/openobserve").rstrip("/")
ORG = "default"
AUTH = base64.b64encode(f"{os.environ['O2_USER']}:{os.environ['O2_PASSWORD']}".encode()).decode()


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{O2_URL}{path}", data=data, method=method)
    req.add_header("Authorization", f"Basic {AUTH}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read().decode() or "{}"
            return res.status, json.loads(raw)
    except urllib.error.HTTPError as err:
        raw = err.read().decode()
        try:
            return err.code, json.loads(raw)
        except ValueError:
            return err.code, {"message": raw}


# ---------------------------------------------------------------- paneles
_panel_seq = [0]


def panel(title, query, *, kind="line", stream, stream_type, query_type="sql",
          x="x_axis_1", y=("y_axis_1",), breakdown=None, unit=None,
          w=12, h=9, x_pos=0, y_pos=0, description="", legend=None):
    _panel_seq[0] += 1
    pid = _panel_seq[0]
    fields = {
        "stream": stream,
        "stream_type": stream_type,
        "x": [] if query_type == "promql" else [{"label": "Tiempo" if x == "x_axis_1" else x, "alias": x, "column": x, "color": None}],
        "y": [] if query_type == "promql" else [
            {"label": label, "alias": label, "column": label, "color": None, "aggregationFunction": None} for label in y
        ],
        "z": [],
        "breakdown": [] if not breakdown else [{"label": breakdown, "alias": breakdown, "column": breakdown, "color": None}],
        "filter": {"filterType": "group", "logicalOperator": "AND", "conditions": []},
    }
    config = {"show_legends": True, "legends_position": "bottom", "decimals": 2, "unit": unit,
              "axis_border_show": False, "connect_nulls": True, "drilldown": [], "mark_line": []}
    return {
        "id": f"Panel_ID{pid}",
        "type": kind,
        "title": title,
        "description": description,
        "config": config,
        "queryType": query_type,
        "queries": [{
            "query": query,
            "vrlFunctionQuery": "",
            "customQuery": True,
            "fields": fields,
            "config": {"promql_legend": legend or "", "layer_type": "scatter", "weight_fixed": 1,
                       "limit": 0, "min": 0, "max": 100, "time_shift": []},
        }],
        "layout": {"x": x_pos * 2, "y": y_pos, "w": w * 2, "h": h, "i": pid},
        "htmlContent": "",
        "markdownContent": "",
    }


def dashboard(title, description, panels):
    return {
        "version": 5,
        "title": title,
        "description": description,
        "role": "",
        "owner": "",
        "tabs": [{"tabId": "default", "name": "General", "panels": panels}],
        "variables": {"list": [], "showDynamicFilters": True},
        "defaultDatetimeDuration": {"type": "relative", "relativeTimePeriod": "30m", "startTime": 0, "endTime": 0},
    }


APP_LOGS = "app_logs"

dash_app = dashboard(
    "Aplicación - Endpoints (RF-04)",
    "Latencia, peticiones por segundo, tasa de errores y statusCode por endpoint (OpenTelemetry)",
    [
        panel("Peticiones por segundo por endpoint",
              "sum by (http_route) (rate(app_http_requests_total[1m]))",
              stream="app_http_requests_total", stream_type="metrics", query_type="promql",
              legend="{http_route}", unit="default", x_pos=0, y_pos=0),
        panel("Latencia p95 por endpoint (ms)",
              "histogram_quantile(0.95, sum by (le, http_route) (rate(app_http_request_duration_ms_bucket[5m])))",
              stream="app_http_request_duration_ms_bucket", stream_type="metrics", query_type="promql",
              legend="{http_route}", x_pos=12, y_pos=0),
        panel("Latencia promedio por endpoint (ms)",
              f'SELECT histogram(_timestamp) AS x_axis_1, route AS breakdown_1, avg(durationms) AS y_axis_1 '
              f'FROM "{APP_LOGS}" WHERE route IS NOT NULL GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1',
              stream=APP_LOGS, stream_type="logs", breakdown="breakdown_1", x_pos=0, y_pos=9),
        panel("Tasa de errores HTTP por endpoint (errores/s)",
              "sum by (http_route, http_status_code) (rate(app_http_errors_total[1m]))",
              stream="app_http_errors_total", stream_type="metrics", query_type="promql",
              legend="{http_route} {http_status_code}", x_pos=12, y_pos=9),
        panel("Peticiones por statusCode",
              f'SELECT CAST(statuscode AS VARCHAR) AS x_axis_1, count(*) AS y_axis_1 FROM "{APP_LOGS}" '
              f'WHERE statuscode IS NOT NULL GROUP BY x_axis_1 ORDER BY x_axis_1',
              kind="bar", stream=APP_LOGS, stream_type="logs", x="x_axis_1", x_pos=0, y_pos=18),
        panel("Peticiones por endpoint y método",
              f'SELECT route AS x_axis_1, method AS breakdown_1, count(*) AS y_axis_1 FROM "{APP_LOGS}" '
              f'WHERE route IS NOT NULL GROUP BY x_axis_1, breakdown_1 ORDER BY y_axis_1 DESC',
              kind="bar", stream=APP_LOGS, stream_type="logs", breakdown="breakdown_1", x_pos=12, y_pos=18),
        panel("Duración promedio de spans: HTTP vs consultas SQLite (µs)",
              'SELECT histogram(_timestamp) AS x_axis_1, operation_name AS breakdown_1, avg(duration) AS y_axis_1 '
              'FROM "default" WHERE operation_name LIKE \'sqlite%\' OR operation_name LIKE \'GET %\' '
              'OR operation_name LIKE \'POST %\' OR operation_name LIKE \'PUT %\' OR operation_name LIKE \'DELETE %\' '
              'GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1',
              stream="default", stream_type="traces", breakdown="breakdown_1", w=24, x_pos=0, y_pos=27),
        panel("Últimos errores y excepciones",
              f'SELECT _timestamp AS x_axis_1, severity, route, statuscode, body '
              f'FROM "{APP_LOGS}" WHERE severity IN (\'ERROR\', \'WARN\') ORDER BY _timestamp DESC LIMIT 50',
              kind="table", stream=APP_LOGS, stream_type="logs", y=("severity", "route", "statuscode", "body"),
              w=24, x_pos=0, y_pos=36),
    ],
)

dash_infra = dashboard(
    "Infraestructura EC2 (RF-05)",
    "CPU, memoria RAM, ancho de banda, disco y temperatura de la instancia EC2",
    [
        panel("CPU utilizada (%)",
              '100 * (1 - avg(system_cpu_utilization{state="idle"}))',
              stream="system_cpu_utilization", stream_type="metrics", query_type="promql",
              legend="CPU %", unit="percent", x_pos=0, y_pos=0),
        panel("Memoria RAM utilizada (%)",
              '100 * sum(system_memory_utilization{state="used"})',
              stream="system_memory_utilization", stream_type="metrics", query_type="promql",
              legend="RAM %", unit="percent", x_pos=12, y_pos=0),
        panel("Ancho de banda de red (bytes/s)",
              'sum by (direction) (rate(system_network_io{device!="lo"}[1m]))',
              stream="system_network_io", stream_type="metrics", query_type="promql",
              legend="{direction}", unit="bytes", x_pos=0, y_pos=9),
        panel("Memoria RAM por estado (bytes)",
              'sum by (state) (system_memory_usage)',
              stream="system_memory_usage", stream_type="metrics", query_type="promql",
              legend="{state}", unit="bytes", x_pos=12, y_pos=9),
        panel("Carga del sistema (load average 1m)",
              'avg(system_cpu_load_average_1m)',
              stream="system_cpu_load_average_1m", stream_type="metrics", query_type="promql",
              legend="load 1m", x_pos=0, y_pos=18),
        panel("Disco: operaciones de E/S por segundo",
              'sum by (direction) (rate(system_disk_operations[1m]))',
              stream="system_disk_operations", stream_type="metrics", query_type="promql",
              legend="{direction}", x_pos=12, y_pos=18),
    ],
)

dash_cicd = dashboard(
    "Pipeline CI/CD (RF-03)",
    "Resultados de pruebas y despliegues enviados por GitHub Actions",
    [
        panel("Ejecuciones por resultado",
              'SELECT event_type AS x_axis_1, status AS breakdown_1, count(*) AS y_axis_1 FROM "cicd_events" '
              'GROUP BY x_axis_1, breakdown_1',
              kind="bar", stream="cicd_events", stream_type="logs", breakdown="breakdown_1", x_pos=0, y_pos=0),
        panel("Eventos del pipeline en el tiempo",
              'SELECT histogram(_timestamp) AS x_axis_1, status AS breakdown_1, count(*) AS y_axis_1 FROM "cicd_events" '
              'GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1',
              kind="bar", stream="cicd_events", stream_type="logs", breakdown="breakdown_1", x_pos=12, y_pos=0),
        panel("Historial de ejecuciones (commit, rama, usuario)",
              'SELECT _timestamp AS x_axis_1, event_type, status, deploy, backend_tests, e2e_tests, '
              'commit, branch, actor, detail FROM "cicd_events" WHERE event_type <> \'setup\' '
              'ORDER BY _timestamp DESC LIMIT 100',
              kind="table", stream="cicd_events", stream_type="logs",
              y=("event_type", "status", "deploy", "backend_tests", "e2e_tests", "commit", "branch", "actor", "detail"),
              w=24, h=12, x_pos=0, y_pos=9),
    ],
)


def ensure_streams():
    """Crea los streams que aún no reciben datos para que dashboards y alertas no fallen."""
    call("POST", f"/api/{ORG}/cicd_events/_json", [{
        "event_type": "setup", "status": "info", "detail": "Configuración de OpenObserve aplicada",
        "deploy": "-", "backend_tests": "-", "e2e_tests": "-", "commit": "-", "branch": "-", "actor": "setup",
        "run_url": "-", "commit_message": "-",
    }])


def temperature_panels():
    """Gráfica de temperatura si el host expone sensores; si no, tabla con el estado del sensor."""
    _, body = call("GET", f"/api/{ORG}/streams/infra_temperature/schema?type=logs")
    fields = {f.get("name") for f in body.get("schema", [])} if isinstance(body, dict) else set()
    if "temperature_celsius" in fields:
        return [
            panel("Temperatura de sensores (°C)",
                  'SELECT histogram(_timestamp) AS x_axis_1, sensor AS breakdown_1, avg(temperature_celsius) AS y_axis_1 '
                  'FROM "infra_temperature" WHERE sensor_disponible = true GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1',
                  stream="infra_temperature", stream_type="logs", breakdown="breakdown_1", unit="celsius",
                  x_pos=0, y_pos=27),
            panel("Lecturas de sensores térmicos",
                  'SELECT _timestamp AS x_axis_1, sensor, temperature_celsius FROM "infra_temperature" '
                  'ORDER BY _timestamp DESC LIMIT 20',
                  kind="table", stream="infra_temperature", stream_type="logs",
                  y=("sensor", "temperature_celsius"), x_pos=12, y_pos=27),
        ]
    print("Aviso: el host no expone sensores de temperatura; se agrega panel de estado")
    return [panel("Temperatura: estado de los sensores térmicos",
                  'SELECT _timestamp AS x_axis_1, host, sensor, sensor_disponible, mensaje FROM "infra_temperature" '
                  'ORDER BY _timestamp DESC LIMIT 20',
                  kind="table", stream="infra_temperature", stream_type="logs",
                  y=("host", "sensor", "sensor_disponible", "mensaje"), w=24, x_pos=0, y_pos=27,
                  description="Las instancias EC2 virtualizadas no exponen sensores térmicos al sistema operativo")]


def upsert_dashboards():
    status, body = call("GET", f"/api/{ORG}/dashboards")
    existing = {}
    for item in body.get("dashboards", body.get("list", [])) if isinstance(body, dict) else []:
        for key in ("v8", "v7", "v6", "v5", "v4", "v3", "v2", "v1"):
            d = item.get(key) if isinstance(item, dict) else None
            if d:
                existing[d.get("title")] = d.get("dashboardId") or item.get("dashboard_id")
                break
        else:
            if isinstance(item, dict) and item.get("title"):
                existing[item["title"]] = item.get("dashboard_id") or item.get("dashboardId")
    dash_infra["tabs"][0]["panels"].extend(temperature_panels())
    for dash in (dash_app, dash_infra, dash_cicd):
        old = existing.get(dash["title"])
        if old:
            call("DELETE", f"/api/{ORG}/dashboards/{old}")
        status, body = call("POST", f"/api/{ORG}/dashboards", dash)
        print(f"Dashboard '{dash['title']}': {status} {'OK' if status == 200 else body}")


def upsert_alerts():
    status, body = call("POST", f"/api/{ORG}/alerts/destinations", {
        "name": "webhook_app", "type": "http", "url": "http://app:3000/api/alerts/webhook",
        "method": "post", "skip_tls_verify": True, "template": "o2_default_content", "headers": {},
    })
    if status != 200:
        status, body = call("PUT", f"/api/{ORG}/alerts/destinations/webhook_app", {
            "name": "webhook_app", "type": "http", "url": "http://app:3000/api/alerts/webhook",
            "method": "post", "skip_tls_verify": True, "template": "o2_default_content", "headers": {},
        })
    print(f"Destino webhook_app: {status}")

    alerts = [
        {"name": "errores_5xx_app", "stream_type": "logs", "stream_name": "app_logs",
         "description": "Más de 5 respuestas HTTP 5xx en 5 minutos",
         "query_condition": {"type": "sql", "conditions": None,
                             "sql": 'SELECT count(*) AS total FROM "app_logs" WHERE statuscode >= 500'},
         "trigger_condition": {"period": 5, "operator": ">=", "threshold": 5, "frequency": 60, "silence": 10}},
        {"name": "latencia_alta_app", "stream_type": "logs", "stream_name": "app_logs",
         "description": "Alguna petición tardó más de 1000 ms en los últimos 5 minutos",
         "query_condition": {"type": "sql", "conditions": None,
                             "sql": 'SELECT count(*) AS lentas FROM "app_logs" WHERE durationms > 1000'},
         "trigger_condition": {"period": 5, "operator": ">=", "threshold": 1, "frequency": 60, "silence": 10}},
        {"name": "pipeline_fallido", "stream_type": "logs", "stream_name": "cicd_events",
         "description": "Pruebas fallidas en GitHub Actions: despliegue bloqueado",
         "query_condition": {"type": "sql", "conditions": None,
                             "sql": "SELECT count(*) AS fallos FROM \"cicd_events\" WHERE status = 'failure'"},
         "trigger_condition": {"period": 10, "operator": ">=", "threshold": 1, "frequency": 60, "silence": 5}},
        {"name": "cpu_alta_ec2", "stream_type": "metrics", "stream_name": "system_cpu_utilization",
         "description": "CPU de la instancia EC2 mayor al 80%",
         "query_condition": {"type": "promql", "promql": '100 * (1 - avg(system_cpu_utilization{state="idle"}))',
                             "promql_condition": {"column": "value", "operator": ">=", "value": 80}},
         "trigger_condition": {"period": 5, "operator": ">=", "threshold": 1, "frequency": 60, "silence": 10}},
        {"name": "memoria_alta_ec2", "stream_type": "metrics", "stream_name": "system_memory_utilization",
         "description": "Memoria RAM de la instancia EC2 mayor al 90%",
         "query_condition": {"type": "promql", "promql": '100 * sum(system_memory_utilization{state="used"})',
                             "promql_condition": {"column": "value", "operator": ">=", "value": 90}},
         "trigger_condition": {"period": 5, "operator": ">=", "threshold": 1, "frequency": 60, "silence": 10}},
    ]

    _, body = call("GET", f"/api/v2/{ORG}/alerts")
    existing = {a.get("name"): a.get("alert_id") or a.get("id") for a in body.get("list", [])}
    for alert in alerts:
        alert.update({"is_real_time": False, "enabled": True, "destinations": ["webhook_app"]})
        if alert["name"] in existing and existing[alert["name"]]:
            call("DELETE", f"/api/v2/{ORG}/alerts/{existing[alert['name']]}")
        status, body = call("POST", f"/api/v2/{ORG}/alerts", alert)
        print(f"Alerta '{alert['name']}': {status} {'OK' if status == 200 else body}")


if __name__ == "__main__":
    status, _ = call("GET", f"/api/{ORG}/organizations")
    if status == 401:
        sys.exit("Credenciales de OpenObserve inválidas")
    ensure_streams()
    upsert_dashboards()
    upsert_alerts()
