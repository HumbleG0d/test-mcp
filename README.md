# API con Observabilidad

## 1. Descripción General

Este proyecto presenta una API RESTful desarrollada en Node.js con el framework Express. El propósito principal de este proyecto no es solo ofrecer funcionalidades de API (un CRUD de usuarios), sino también servir como un ejemplo práctico de cómo instrumentar una aplicación moderna para la **observabilidad**.

La API está diseñada para generar una rica telemetría, incluyendo:
- **Trazas (Traces):** Para seguir el flujo de una solicitud a través de los diferentes componentes de la aplicación.
- **Métricas (Metrics):** Tanto técnicas (duración de la solicitud, uso de CPU) como de negocio (número de usuarios creados).
- **Logs:** Registros detallados de la actividad de la aplicación.

Estos datos son enviados a una pila de monitoreo externa (como la pila Elastic: Elasticsearch, Kibana, APM Server) a través de un colector de OpenTelemetry, permitiendo un análisis y monitoreo en tiempo real del rendimiento y la salud de la aplicación.

## 2. Arquitectura

El proyecto está compuesto por varios elementos clave que trabajan en conjunto:

- **`runbooks/api.js`**: Es el corazón de la aplicación. Una API de Express que expone endpoints para un CRUD de usuarios. Utiliza la librería **OpenTelemetry** para instrumentar automáticamente las solicitudes HTTP, las llamadas a la base de datos (en memoria en este caso) y para crear métricas y trazas personalizadas.

- **`Dockerfile`**: Define el entorno de ejecución de la aplicación. Se utiliza para construir una imagen de Docker que contiene la aplicación y todas sus dependencias. Sigue las mejores prácticas, como el uso de un usuario no-root y un `HEALTHCHECK` para verificar el estado de la aplicación.

- **`runbooks/docker-compose-api.yml`**: Este archivo de Docker Compose orquesta el despliegue local de la API junto con un **Servidor APM de Elastic**. Es importante destacar que este `docker-compose` está diseñado para conectarse a una red externa (`otel-network`), lo que implica que se espera que otros componentes de la pila de observabilidad (como Elasticsearch, Kibana y el Colector de OpenTelemetry) ya estén en ejecución.

- **`Jenkinsfile`**: Contiene la definición de un pipeline de **CI/CD (Integración Continua/Despliegue Continuo)** para Jenkins. Este pipeline automatiza todo el ciclo de vida de la aplicación:
    - Compilación y empaquetado.
    - Ejecución de pruebas unitarias y de calidad de código.
    - Escaneo de seguridad.
    - Construcción de la imagen de Docker.
    - Despliegue en un entorno de "staging".
    - Ejecución de pruebas de humo y rendimiento.
    - Despliegue en producción (con aprobación manual).

- **`h.sh`**: Un script de utilidad (`bash`) diseñado para facilitar las pruebas locales. Este script:
    - Verifica que todos los servicios necesarios estén en funcionamiento.
    - Genera una carga de tráfico simulada contra la API para producir datos de telemetría.
    - Consulta el endpoint de métricas de la API.
    - Realiza una búsqueda en Elasticsearch para confirmar que los datos están siendo recibidos y almacenados correctamente.

## 3. Cómo Ejecutar el Proyecto

Para ejecutar este proyecto, es necesario tener una pila de observabilidad compatible con OpenTelemetry ya en funcionamiento. El archivo `docker-compose-api.yml` asume que esta pila está disponible y conectada a una red de Docker llamada `otel-network`.

**Prerrequisitos:**
- Docker y Docker Compose instalados.
- Una pila de observabilidad (Ej: Elastic Stack + OTel Collector) corriendo y conectada a la red `otel-network`.

**Pasos:**
1.  **Navegar al directorio `runbooks`**:
    ```bash
    cd runbooks
    ```
2.  **Levantar los servicios**:
    Desde el directorio `runbooks`, ejecute el siguiente comando para iniciar la API y el Servidor APM:
    ```bash
    docker-compose -f docker-compose-api.yml up -d
    ```
3.  **Verificar que los contenedores estén en ejecución**:
    ```bash
    docker ps
    ```
    Debería ver dos contenedores en ejecución: `express-metrics-api` y `apm-server`.

## 4. Cómo Verificar

Una vez que la API y la pila de observabilidad estén en funcionamiento, el siguiente paso es verificar que la telemetría se está generando y recopilando correctamente. Para ello, se proporciona el script `h.sh`.

**Pasos para la verificación:**
1.  **Dar permisos de ejecución al script**:
    Desde el directorio raíz del proyecto:
    ```bash
    chmod +x h.sh
    ```
2.  **Ejecutar el script de verificación**:
    ```bash
    ./h.sh
    ```
    El script realizará las siguientes acciones:
    - **Comprobará la salud** de todos los servicios (API, APM Server, Collector, Elasticsearch).
    - **Generará tráfico** intensivo hacia la API, incluyendo solicitudes válidas, errores y pruebas de carga.
    - **Consultará el endpoint `/metrics`** de la API para mostrar las métricas locales.
    - **Esperará 20 segundos** para dar tiempo a que los datos se procesen y se indexen.
    - **Buscará en Elasticsearch** para confirmar la presencia de nuevas trazas y métricas.

Si la verificación es exitosa, el script mostrará un mensaje de **"¡ÉXITO! Las métricas están llegando a Elasticsearch"** y proporcionará URLs útiles y los siguientes pasos para visualizar los datos en Kibana.

## 5. Pipeline de CI/CD

El archivo `Jenkinsfile` define un pipeline de CI/CD robusto y completo que automatiza la entrega de la aplicación. Este pipeline está diseñado para garantizar la calidad y la seguridad del código en cada paso.

**Etapas Principales del Pipeline:**

1.  **Checkout**: Clona el repositorio de código.
2.  **Setup Environment**: Configura el entorno de construcción con Node.js y Docker.
3.  **Dependencies**: Instala las dependencias de Node.js, utilizando un caché para acelerar el proceso.
4.  **Code Quality**: Ejecuta herramientas de análisis estático de código (linting) para asegurar un estilo de código consistente.
5.  **Testing**: Ejecuta la suite de pruebas unitarias y de integración, generando reportes de resultados y de cobertura de código.
6.  **Build Docker Image**: Construye la imagen de Docker de la aplicación.
7.  **Security Scanning**: Escanea la imagen de Docker en busca de vulnerabilidades conocidas.
8.  **Deploy to Staging**: Despliega la nueva versión de la aplicación a un entorno de `staging`.
9.  **Smoke Tests**: Realiza una serie de pruebas básicas contra el entorno de `staging` para asegurar que el despliegue fue exitoso y la aplicación funciona correctamente.
10. **Performance Tests**: (Opcional) Ejecuta pruebas de carga para medir el rendimiento de la aplicación bajo estrés.
11. **Tag & Push Image**: Si las pruebas son exitosas y la rama es `main`, la imagen de Docker es etiquetada y subida a un registro de contenedores.
12. **Deploy to Production**: Requiere una **aprobación manual** para desplegar la aplicación en el entorno de producción, añadiendo una capa de seguridad antes del lanzamiento final.
