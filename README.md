# Proyecto DevOps - API REST con CI/CD, Docker y AWS

Este repositorio contiene una API REST desarrollada en Node.js, implementada bajo prácticas profesionales de DevOps que incluyen pruebas automatizadas con cobertura, contenedorización con Docker, integración continua mediante GitHub Actions y despliegue continuo en un servidor remoto en AWS EC2.

## Tecnologías y Herramientas Utilizadas
- Backend: Node.js
- Pruebas y Cobertura: Vitest con umbral de cobertura estricto
- Contenedorización: Docker y Docker Hub
- Integración y Despliegue Continuo: GitHub Actions
- Infraestructura: AWS EC2 Ubuntu Server expuesto en el puerto 80

## Arquitectura del Pipeline
El flujo de trabajo automatizado se activa en cada push a la rama main y consta de tres etapas:
1. Integración Continua: Se descargan dependencias, se ejecutan las pruebas automatizadas con Vitest y se valida el porcentaje de cobertura.
2. Compilación y Publicación: Se empaqueta la aplicación en una imagen Docker optimizada, etiquetándola con latest y con el hash único del commit para publicarla en Docker Hub.
3. Despliegue Continuo: Utilizando claves SSH seguras resguardadas en GitHub Secrets, el pipeline se conecta al servidor de AWS, descarga la nueva imagen, detiene el contenedor anterior y despliega la versión actualizada en el puerto 80.

## Comandos Locales
Para clonar y ejecutar este proyecto de forma local en tu máquina, sigue estos pasos:

Clonar el repositorio:
git clone <url-de-tu-repositorio>
cd <nombre-del-repositorio>

Instalar dependencias:
npm install

Ejecutar la aplicación en modo desarrollo:
npm run dev

Ejecutar las pruebas automatizadas y reporte de cobertura:
npm run test:coverage

Construir y probar el contenedor Docker localmente:
docker build -t app-devops-api .
docker run -p 3000:3000 app-devops-api

## Enlace a Producción
La API se encuentra desplegada y operando en vivo en la nube de AWS:
URL Pública: http://18.225.169.138/api/estudiantes

## Seguridad
Ninguna credencial, token de Docker Hub, IP de servidor o llave privada SSH está expuesta en el código fuente del repositorio. Todos los datos sensibles son gestionados mediante GitHub Secrets.

## Pruebas
Primera prueba 