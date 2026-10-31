# Infraestructura compartida del backend

El negocio pertenece a `src/modules`. Esta carpeta contiene transporte, errores,
paginación, cuotas y utilidades técnicas. La composición de readiness está en
[`src/readiness.ts`](../readiness.ts), fuera de shared.

| Carpeta / archivo | Responsabilidad |
| --- | --- |
| [http/api-response.ts](http/api-response.ts) | Serializador único: `sendSuccess`, `sendApiError` y alias `sendError`. |
| [http/api.types.ts](http/api.types.ts) | Sobres, errores y contratos generales de validación/paginación HTTP. |
| [errors/api-error.ts](errors/api-error.ts) | Error previsto con código/status y plazo de reintento para429. |
| [http/error-handler.ts](http/error-handler.ts) | JSON inválido, payload grande, errores de drivers/aplicación, sanitización y404. |
| [http/validate-request.ts](http/validate-request.ts) | Validación por sección y valores normalizados en locals. |
| [http/endpoint-policy.ts](http/endpoint-policy.ts) | Declaración obligatoria de acceso; integra el middleware de auth. |
| [http/rate-limit.middleware.ts](http/rate-limit.middleware.ts) | Cuotas por origen y por identidad verificada. |
| [rate-limit/rate-limit.ts](rate-limit/rate-limit.ts) | Contrato de contador, claves hash,429 y memoria limitada de development/test. |
| [pagination/pagination.ts](pagination/pagination.ts) | Parseo y metadatos de paginación. |
| [health/health-response.ts](health/health-response.ts) | Respuesta sanitaria sin detalles sensibles. |
| [health/module-health.ts](health/module-health.ts) | Sondas concurrentes y caché técnica breve. |
| [health/health.types.ts](health/health.types.ts) | Contratos de salud de módulos/readiness. |
| [async/deadline.ts](async/deadline.ts) | Límite temporal de operaciones asíncronas. |

## Respuestas HTTP

`sendSuccess(response, data, status)` y `sendSuccess(response, data, {status, meta})`
usan una sola implementación.200/201/202 entregan `{data}` y opcionalmente `meta`;
204 termina sin cuerpo. `sendError` es el mismo serializador que `sendApiError`,
no otra implementación. El error mantiene `{error:{code,message,details?}}`.

El handler conserva `Retry-After`, oculta detalles internos y distingue las caídas
de dependencias. Formatear no equivale a autenticar ni autorizar. El liveness
histórico `/api/v1/health` conserva `{status:"ok"}`.

Redis se implementa en [database/redis/rate-limit.redis.ts](../database/redis/rate-limit.redis.ts).
Su contador/TTL atómico se comparte entre instancias; production requiere Redis y
una caída produce503. La memoria local solo se usa en development/test sin URL.

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

- [bootstrap.ts](../bootstrap.ts): verifica las dependencias antes de abrir el puerto HTTP. Si la verificación falla, el arranque se detiene y se cierran las conexiones abiertas.
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
- Al incorporar un módulo al arranque, añadir su comprobador a `getReadiness` y actualizar los tipos de [health.types.ts](health/health.types.ts).
- Definir la autorización de nuevas operaciones en su tarea funcional. Un diagnóstico correcto confirma disponibilidad técnica; no autoriza a leer o modificar datos.
