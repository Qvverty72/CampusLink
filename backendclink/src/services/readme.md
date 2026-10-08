# Servicios compartidos del backend

Esta carpeta reúne funciones de infraestructura que reutilizan los módulos de la API. Sus archivos se importan desde el servidor; no se ejecutan como comandos independientes.

Los archivos `*.service.ts` dentro de `src/modules` coordinan cada módulo. Los servicios de esta carpeta proporcionan respuestas HTTP uniformes, diagnósticos de dependencias y límites de espera compartidos.

## Archivos

| Archivo | Responsabilidad | Exportaciones |
| --- | --- | --- |
| [api-response.ts](api-response.ts) | Construir respuestas correctas y errores HTTP. | `ApiError`, `sendSuccess`, `sendError` |
| [health-response.ts](health-response.ts) | Convertir el diagnóstico de un módulo en una respuesta HTTP. | `sendModuleHealth` |
| [module-health.ts](module-health.ts) | Coordinar y almacenar brevemente las comprobaciones de dependencias. | `createModuleHealthCheck` |
| [readiness.ts](readiness.ts) | Reunir los diagnósticos de los siete módulos. | `getReadiness` |
| [deadline.ts](deadline.ts) | Limitar cuánto se espera una operación asíncrona. | `withDeadline` |

## api-response.ts

- `sendSuccess(response, data, status = 200)` envía el código HTTP indicado y un JSON con `data`.
- `sendError(response, status, code, message)` envía el código HTTP indicado y un JSON con `error.code` y `error.message`.
- `ApiError(status, code, message)` representa un error previsto. El middleware [error-handler.ts](../middleware/error-handler.ts) reconoce esta clase y utiliza sus valores para responder.

Ejemplo de éxito:

~~~json
{"data":{"module":"users","status":"ok","dependencies":{"supabase":"ok"}}}
~~~

Ejemplo de error:

~~~json
{"error":{"code":"DEPENDENCY_UNAVAILABLE","message":"A required dependency is unavailable"}}
~~~

Los consumidores principales son el router, los controladores de diagnóstico y el middleware de errores. Los tipos están en [api.types.ts](../types/api.types.ts).

Estos helpers formatean la respuesta; no validan datos, autentican al solicitante ni limpian automáticamente el mensaje proporcionado. Usar mensajes aptos para el cliente, sin credenciales, consultas ni errores internos del proveedor.

Las rutas históricas `/health` y `/maps/:campusId/active` conservan sus contratos propios para mantener compatibilidad con Expo.

## health-response.ts

`sendModuleHealth(response, health)` recibe un diagnóstico `ModuleHealth` ya calculado:

- Estado `ok`: responde `200` con `{ data: health }`.
- Estado `unavailable`: responde `503` con el error genérico `DEPENDENCY_UNAVAILABLE`, sin entregar los detalles de la dependencia fallida.
- En ambos casos añade `Cache-Control: no-store` para impedir almacenar la respuesta HTTP.

Lo utilizan los controladores de los siete módulos. No consulta bases de datos: transforma el resultado que recibe del servicio del módulo.

## module-health.ts

`createModuleHealthCheck(module, probe, ttlMs)` crea una función que devuelve una promesa con el estado del módulo. El parámetro `probe` es una función que comprueba sus dependencias mediante el repository.

El resultado contiene:

~~~json
{"module":"maps","status":"ok","dependencies":{"supabase":"ok","mongodb":"ok"}}
~~~

El estado del módulo es `ok` cuando todas las dependencias devuelven `ok`; si alguna devuelve `error`, es `unavailable`.

La función comparte una comprobación en curso entre llamadas simultáneas. Al terminar, conserva brevemente el resultado, incluyendo los estados de fallo, durante `HEALTH_CACHE_TTL_MS`. El TTL comienza al terminar la comprobación. Con TTL `0` no se reutilizan resultados terminados, pero las llamadas simultáneas siguen compartiendo la operación pendiente.

Si `probe` rechaza su promesa, el rechazo se propaga y se libera la operación pendiente. El helper no convierte por sí mismo esa excepción en un estado de dependencia.

Cada `*.service.ts` de los módulos crea su comprobador una sola vez. Crear otro por cada petición perdería la caché y la coordinación de concurrencia.

Esta caché vive en la memoria del proceso. No almacena datos de negocio ni representa permisos del usuario; es independiente de `Cache-Control: no-store`.

## readiness.ts

`getReadiness()` ejecuta en paralelo los diagnósticos de:

1. users
2. auth
3. maps
4. physicalgoods
5. elibrary
6. reports
7. analytics

Devuelve `{ status, modules }`. El estado global es `ok` solo si todos los módulos están disponibles; en caso contrario es `unavailable`. Utiliza los comprobadores y la caché de cada módulo. Una excepción inesperada de alguno se propaga.

Tiene dos consumidores principales:

- [bootstrap.ts](../bootstrap.ts): verifica las dependencias antes de abrir el puerto HTTP. Si la verificación falla, el arranque se detiene y se cierra MongoDB.
- [routes/index.ts](../routes/index.ts): atiende `GET /api/v1/ready`. Responde `200` con el resultado global o `503` con un error genérico de dependencia.

La ruta `/ready` y los diagnósticos individuales solo se registran con `NODE_ENV=development` y `HEALTH_DIAGNOSTICS_ENABLED=true`. El arranque verifica las dependencias también cuando esas rutas están deshabilitadas.

El diagnóstico de auth comprueba su tabla de perfiles; no equivale a validar una sesión real en Supabase Auth.

## deadline.ts

`withDeadline(operation, timeoutMs)` espera una promesa hasta el límite indicado, usando `DATABASE_TIMEOUT_MS` por defecto. Si la operación termina antes, entrega su resultado o propaga su error. Si vence el plazo, rechaza con un error llamado `DependencyTimeoutError`. El temporizador se limpia al terminar.

Lo utilizan [database/health.ts](../database/health.ts) para las sondas y [database/mongodb/client.ts](../database/mongodb/client.ts) para conexión y cierre. Cubre esperas como la resolución DNS SRV, que pueden quedar fuera de los timeouts de operaciones del driver.

Este helper limita la espera; no cancela automáticamente la operación original. Los clientes deben gestionar su cancelación o finalización tardía. El cliente MongoDB cierra una conexión que termina después de que su espera haya fallado.

## Flujo de un diagnóstico

Una solicitud al health de un módulo pasa por:

`routes → controller → service del módulo → createModuleHealthCheck → repository → clientes de base de datos`

El controlador recibe el resultado y utiliza `sendModuleHealth` para responder. Los repositories comprueban disponibilidad mediante lecturas acotadas; no insertan documentos ni filas. Una tabla o colección existente vacía es válida. La ausencia de una colección requerida produce un fallo.

`GET /api/v1/health` comprueba únicamente que el proceso atiende solicitudes. `GET /api/v1/ready` comprueba las dependencias de los siete módulos.

## Configuración relacionada

| Variable | Valor por defecto | Efecto |
| --- | --- | --- |
| `DATABASE_TIMEOUT_MS` | `5000` | Límite de espera en milisegundos; rango permitido 100–60000. |
| `HEALTH_CACHE_TTL_MS` | `5000` | Duración de resultados en memoria; rango 0–60000. |
| `HEALTH_DIAGNOSTICS_ENABLED` | `false` | Habilita rutas detalladas únicamente en development. |
| `NODE_ENV` | `development` | Determina si las rutas de diagnóstico pueden registrarse. |

La validación de estas variables está en [config/env.ts](../config/env.ts). Los clientes de base de datos usan las credenciales del servidor configuradas allí.

## Cómo extender estos servicios

- Reutilizar los helpers de respuesta para nuevas rutas y conservar los contratos ya consumidos por Expo.
- Mantener las consultas en los repositories y las reglas propias del módulo en sus `*.service.ts`.
- Al incorporar un módulo al arranque, añadir su comprobador a `getReadiness` y actualizar los tipos de [api.types.ts](../types/api.types.ts).
- Definir la autorización de nuevas operaciones en su tarea funcional. Un diagnóstico correcto confirma disponibilidad técnica; no autoriza a leer o modificar datos.
