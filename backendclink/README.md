# CampusLink Backend

Ciclo de vida de actividades: [finalización automática y reactivación](docs/activities-lifecycle.md).
Al llegar endAt, comunitarias/oficiales pasan a FINISHED en Mongo mediante el
mantenimiento al arrancar y cada minuto, sin borrar documentos ni participaciones.

Denuncias F2.6-09: [API, persistencia común y QA manual](docs/activities-reports.md). `POST /api/v1/reports/activities/:activityId` guarda PENDIENTE en `reporte_contenido`, con motivo libre, descripción opcional y copia del contenido; no modifica actividades ni inscripciones. Revisión administrativa corresponde a F2.6-10. Sin migraciones ni colecciones nuevas.

Base API REST de F2.2-03 (GitHub #50). Node.js 22, TypeScript, Express 5, Supabase JS y driver oficial MongoDB. Las rutas se montan en /api/v1.

Actividades del mapa F2.6-01: `GET /api/v1/activities` requiere Bearer y autorización general del campus vigente. Admite `buildingKey`, `floorKey` y `poiKey` como filtros de la jerarquía; un filtro de piso requiere edificio y un filtro de POI requiere piso. No acepta campus, tipo, estado o visibilidad enviados por el cliente. Responde `{ data: ActivityDto[] }`, con fechas ISO y nombres de ubicación resueltos desde el mapa activo.

Detalle F2.6-02 y participación mínima: [endpoints, contrato JOINED/LEFT, índice único y transacción](docs/activities-detail.md). `GET /api/v1/activities/:activityId` añade organizador y participación propia; `PUT /api/v1/activities/:activityId/participation` inscribe sin cuerpo ni identidad del cliente.

Participación F2.6-07: [inscripción, retiro y consulta propia](docs/activities-participation.md). GET/DELETE en `/:activityId/participation` consultan el estado o retiran al usuario autenticado, incluso después del término. El retiro guarda LEFT y descuenta el contador una sola vez; la reinscripción vigente conserva el mismo registro. Sin nuevas colecciones.

Interacciones F2.6-07/F2.7-01: [estado actual, log append-only y migración](docs/activities-interactions.md). JOINED/LEFT se registran junto al estado y contador en transacciones; VIEWED registra aperturas reales de ficha, sin contar tarjetas ni refresh. Métricas futuras consultan `activity_interactions`; el historial migrado está identificado como parcial.

Notificaciones F2.6-08: [entrega durable y bandeja propia](docs/activities-notifications.md). Eventos pendientes embebidos en activities y entrega idempotente a notificacion existente. Una serie oficial genera un aviso al inicio real de cada ocurrencia, incluida la primera, con título/mensaje de publicación individual y sin textos de recurrencia. Guardar fechas futuras o terminar la anterior no anticipa el aviso. Cada aviso abre su actividad concreta con acceso general del campus. Cambios conjuntos se agrupan por usuario afectado, con motivos/cantidad propios. Bandeja GET/PUT lectura/DELETE bajo `/api/v1/users/me/notifications`; aplicar migración base `f2_6_08_notificaciones.sql`. Esta evolución no requiere migración adicional, colecciones nuevas ni cambios de RLS/permisos.

Creación F2.6-03: [contrato comunitario](docs/activities-create.md), `POST /api/v1/activities`. Publicación F2.6-04: [contrato oficial y autorización por campus](docs/activities-official.md), `POST /api/v1/activities/official`. Ambas comparten validación/ubicación/transacción e inscriben al creador JOINED; el servidor fija el tipo. USUARIO_AUTORIZADO necesita PUBLICAR_EVENTO del campus vigente para publicar oficialmente; ADMINISTRADOR conserva acceso automático aprobado.

Recurrencia F2.6-05: [vista previa, calendario, API e índice de ocurrencias](docs/activities-recurrence.md). Repetición diaria/semanal/mensual con fecha final y exclusiones, preservando hora local. La definición de serie queda en `activities.seriesDefinition` de la primera ocurrencia; publicar inserta actividades y creador JOINED en una transacción. `003_activity_series.mongosh.js` configura únicamente el índice existente de ocurrencias; no crea colecciones ni se ejecuta al arrancar.

Edición F2.6-06: [vista previa, revisiones e historial embebido](docs/activities-edit.md). El creador edita contenido, fechas y lugar de una sola actividad u ocurrencia, conservando tipo e inscripciones. `POST /api/v1/activities/:activityId/edit/preview` revisa cambios; `PATCH /api/v1/activities/:activityId` exige esa confirmación. Ambas aceptan únicamente `scope: 'ONE'` y rechazan edición grupal. El historial se añade a `activities.changeHistory` en la misma actualización. No se crean colecciones nuevas. La reparación de las colecciones anteriores ya se aplicó y su herramienta fue retirada; la evidencia queda en `context/tasks/LOCAL-20261010-activities-existing-collections/`.

Contrato de lectura acordado: `type` es `COMMUNITY_ACTIVITY` u `OFFICIAL_EVENT`, `status` es `ACTIVE`, `visibility` es `PUBLIC` y `endAt` es posterior al momento de consulta. Incluye actividades futuras y en curso con fechas válidas. Cada actividad debe referenciar `location.buildingKey = building.id` y `location.floorKey = floor.id`; `poiKey` es opcional y debe pertenecer al piso y estar visible/no eliminado. `meshName` solo vincula geometría 3D. No ejecutar el bootstrap documental histórico como migración de este contrato. Esta entrega no crea actividades ni índices/validadores remotos.

Inicio/cierre/recuperación de sesión F2.3-03: [contratos, permisos, plantilla y configuración de Supabase](docs/session-login-recovery.md).

Perfil académico F2.3-04: [API, validaciones, guardado transaccional y migración necesaria en Supabase](docs/academic-profile.md).

Roles y permisos por campus F2.3-05: administración mediante `/api/v1/users/access`, con alcance vigente, listado paginado y auditoría atómica. Requiere `SUPABASE_DB_URL`, administrador previamente incorporado y `src/database/supabase/migrations/f2_3_05_roles_permisos.sql`. [Guía local](docs/campus-role-permissions.md).

Autorización F2.3-06: [políticas por ruta, comprobaciones de permiso/campus/propietario y guía para servicios futuros](docs/campus-authorization.md). El mapa ahora exige Bearer y campus vigente. No requiere SQL nuevo.

Suspensión/desactivación F2.3-07: [acciones de cuenta, auditoría, retirada física y conservación digital](docs/account-state.md). Desde Administrar cuentas y accesos; PATCH dedicado `/users/access/campuses/:campusId/users/:userId/state`. Aplicar `src/database/supabase/migrations/f2_3_07_estado_cuenta.sql`: solo permisos/RLS sobre publicaciones existentes, sin tablas/columnas nuevas. El guardado revalida al administrador bajo transacción.

Auditoría F2.3-08: [consulta del historial administrativo por campus](docs/administrative-audit.md). Desde Mi perfil → Historial administrativo; GET `/users/access/campuses/:campusId/audit` y `/audit/:auditId`. Aplicar `src/database/supabase/migrations/f2_3_08_auditoria.sql` después de F2.3-05: lectura/inserción del servidor y bloqueo de acceso directo cliente sobre `auditoria` existente. Sin tablas ni columnas nuevas.

## Ejecución local

Desde backendclink, instalar con npm ci y completar .env a partir de .env.example. No sobrescribir un .env existente.

| Variable | Uso |
| --- | --- |
| PORT | Puerto al ejecutar directamente con Node; Compose fija 3000 dentro del contenedor |
| HOST_PORT | Puerto publicado por Compose en el computador; 3000 por defecto |
| NODE_ENV | development, test o production; development por defecto |
| MONGODB_URI | URI mongodb:// o mongodb+srv://, obligatoria |
| MONGODB_DNS_SERVERS | Opcional: IPs DNS separadas por comas para SRV/TXT en este proceso Node; vacío usa el DNS del sistema. Ejemplo: 1.1.1.1,8.8.8.8 |
| MONGODB_DB_NAME | Base documental; campuslink por defecto |
| SUPABASE_URL | Origen HTTP(S) del proyecto Supabase, obligatorio |
| SUPABASE_PUBLISHABLE_KEY | Clave pública del proyecto, obligatoria |
| SUPABASE_SECRET_KEY | Clave exclusiva del servidor requerida por registro, lecturas de perfil y referencia del campus del mapa; opcional solo para las sondas técnicas |
| SUPABASE_SERVICE_ROLE_KEY | Alias legacy de la clave de servidor; SECRET_KEY tiene preferencia |
| SUPABASE_DB_URL | URL PostgreSQL/pooler exclusiva del backend para guardar el perfil académico en una transacción; usa contraseña DB y TLS verificado |
| DATABASE_TIMEOUT_MS | Límite por operación/sonda, 5000 ms por defecto, rango 100–60000 |
| HEALTH_DIAGNOSTICS_ENABLED | true para registrar diagnósticos detallados solo en development; false por defecto |
| HEALTH_CACHE_TTL_MS | Caché de sondas, 5000 ms por defecto; 0 desactiva caché entre solicitudes |

Comandos:

~~~sh
npm run typecheck
npm run build
npm run dev
# Después de build, para ejecutar el artefacto:
npm start
~~~

El arranque conecta MongoDB y verifica las tablas/colecciones necesarias de todos los módulos antes de abrir el puerto. Un error impide aceptar tráfico y cierra el pool. Los registros de fallo no imprimen credenciales ni consultas. SIGINT/SIGTERM cierran HTTP y MongoDB; HTTP tiene un límite de drenaje.

Las verificaciones de Mongo incluyen un límite externo para conexión/SRV DNS, porque el timeout de operaciones del driver no cubre toda la conexión inicial. Una conexión que termine tarde tras un timeout se cierra. Supabase tiene timeout y reintentos de Data API deshabilitados para mantener el límite.

## Ejecutar con Docker en otro computador

La API se ejecuta en un contenedor Linux con Node.js 22 y dependencias instaladas desde package-lock.json. Supabase y MongoDB Atlas permanecen en la nube: esta configuración no levanta bases locales ni copia sus datos.

### Requisitos

- Docker Engine/Docker Desktop y Docker Compose activos. En Docker Desktop, usar contenedores Linux.
- Una copia del repositorio con backendclink/package-lock.json. No hace falta instalar Node/npm en el computador.
- Acceso de red a los servicios y un usuario de base de datos Atlas con los permisos necesarios.
- IP pública de salida autorizada en Atlas → Network Access. Cambiar de computador o red puede cambiar esa IP. Docker no elimina este requisito.
- Tablas Supabase y colecciones MongoDB requeridas ya disponibles. El arranque comprueba dependencias; no crea esquemas.

### Configurar y arrancar

Desde backendclink, copiar el ejemplo solo si todavía no existe .env:

~~~powershell
# PowerShell
Copy-Item .env.example .env
~~~

~~~sh
# Linux/macOS
cp .env.example .env
~~~

Completar .env localmente con MONGODB_URI, MONGODB_DB_NAME, SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY. Configurar SUPABASE_SECRET_KEY para las operaciones de negocio que consultan referencias mediante el cliente de servidor y SUPABASE_DB_URL para escrituras transaccionales. Obtener estos valores por el canal privado del equipo: no están en la imagen ni en el repositorio.

Construir e iniciar:

~~~sh
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 180
docker compose ps
docker compose logs --tail=50 backend
~~~

Comprobar HTTP con un navegador o cliente REST:

~~~sh
curl http://localhost:3000/api/v1/health
~~~

En PowerShell, utilizar curl.exe si curl corresponde a un alias. La respuesta esperada es {"status":"ok"}. El contenedor solo abre el puerto después de comprobar las dependencias. Su healthcheck posterior verifica que HTTP responde; no consulta las bases en cada ejecución. Compose espera a que esté saludable con --wait.

La imagen y Compose utilizan NODE_ENV=development; Compose fija PORT=3000 dentro del contenedor. HEALTH_DIAGNOSTICS_ENABLED se toma del .env: con true se registran /ready y los health de módulos; con false responden 404. Los valores definidos en environment prevalecen sobre env_file.

El contenedor sigue ejecutando node dist/server.js: el build compila src y el runtime instala únicamente sus dependencias necesarias. Para aplicar cambios de código, ejecutar docker compose up --build -d --wait --wait-timeout 180. No se han añadido watch ni montajes del código local. Esta configuración es para desarrollo; un despliegue de producción deberá fijar NODE_ENV=production y conservar los diagnósticos detallados deshabilitados.

Si el puerto 3000 está ocupado, poner HOST_PORT=3001 en .env y repetir el inicio. La URL será http://localhost:3001; el puerto interno sigue siendo 3000. Compose genera el nombre del contenedor y evita un nombre global fijo.

### DNS de Atlas dentro del contenedor

Dejar MONGODB_DNS_SERVERS vacío utiliza el DNS disponible en Docker. Es la configuración por defecto del ejemplo y la adoptada localmente: se verificó conexión a Atlas y lectura del mapa sin indicar IPs públicas el 2026-10-08. Docker resuelve a través de su servicio DNS interno y la configuración de red del equipo; no añadir su IP interna al .env. Si Atlas falla al resolver SRV/TXT con querySrv/ECONNREFUSED, configurar resolvers accesibles desde esa red, por ejemplo:

~~~dotenv
MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8
~~~

La API aplica ese valor al proceso Node también dentro del contenedor. No hay que cambiar el DNS de Windows. El override afecta dns.resolve*, incluida la resolución SRV/TXT; no cambia dns.lookup ni el DNS general de otros procesos. No sustituye Internet, permisos ni la lista de IP autorizadas en Atlas. En una red que bloquea DNS públicos o usa resolución privada/VPN, utilizar los resolvers permitidos por esa red.

Después de cambiar .env:

~~~sh
docker compose up -d --force-recreate --wait --wait-timeout 180
~~~

docker compose restart no recarga las variables del archivo. Si cambia el código/Dockerfile, utilizar otra vez up --build. Cambiar solo variables no requiere reconstruir la imagen.

### Detener y reproducibilidad

~~~sh
docker compose down
~~~

Retira los contenedores y la red del proyecto; las bases remotas permanecen. El proceso Node recibe las señales de cierre mediante init y tiene tiempo para drenar HTTP y cerrar MongoDB. Se ejecuta como usuario node.

La construcción usa archivos del proyecto, sin node_modules/dist del equipo ni secretos. La familia node:22-alpine fija la versión mayor de Node; el lockfile fija las dependencias npm. La etiqueta de Node puede actualizarse con versiones de mantenimiento: para repetir exactamente una imagen aprobada, conservar su digest en el proceso de publicación. No se fuerza platform: amd64; Docker selecciona la arquitectura de la imagen base al construir.

Referencias: [Compose: servicios y salud](https://docs.docker.com/reference/compose-file/services/), [prioridad de variables](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/), [conexión Atlas](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/) y [DNS de Node](https://nodejs.org/api/dns.html).

## Módulos y arquitectura

Cada módulo tiene <nombre>.routes.ts, <nombre>.controller.ts, <nombre>.service.ts, <nombre>.repository.ts y <nombre>.types.ts. maps conserva el prefijo histórico map.*. Los submódulos de marketplace siguen exactamente el mismo patrón.

Flujo: routes → controller → service → repository → cliente compartido. Repository conoce las queries, service coordina el caso de uso y controller conoce HTTP. Imports .js mantienen compatibilidad NodeNext. Los helpers compartidos de respuesta y diagnóstico evitan siete implementaciones divergentes. Consulta [la documentación de services](src/services/readme.md) para conocer sus funciones y consumidores.

| Módulo | Lecturas de su health |
| --- | --- |
| users | Supabase: perfil_usuario |
| auth | Supabase: perfil_usuario; esto no comprueba Supabase Auth |
| maps | Supabase: campus; MongoDB: campus_maps |
| marketplace/physicalgoods | Supabase: publicacion_recurso filtrada FISICO y recurso_fisico |
| marketplace/elibrary | Supabase: publicacion_recurso filtrada DIGITAL y recurso_digital |
| reports | Supabase: reporte_contenido; denuncias de contenido |
| analytics | Supabase: interaccion_recurso y reporte; MongoDB: activities y activity_interactions |

La carpeta auth contiene la integración de identidad. Login será un caso de uso de auth, junto con recuperación/renovación/cierre de sesión; no hay un segundo módulo login. users será responsable del perfil académico. reports gestiona denuncias; los informes analíticos y sus instantáneas pertenecen a analytics.

Los health verifican disponibilidad técnica mediante lecturas acotadas y descartan las filas. No calculan KPI ni exponen listados de perfiles o denuncias. MongoDB distingue colecciones ausentes de colecciones existentes vacías.

## Rutas

| Método | Ruta | Acceso y respuesta |
| --- | --- | --- |
| GET | /api/v1/health | Público, liveness; contrato existente { status: 'ok' }, no consulta bases |
| GET | /api/v1/ready | Diagnóstico de desarrollo con opt-in; agrega las siete sondas |
| GET | /api/v1/users/health | Diagnóstico de desarrollo con opt-in |
| GET | /api/v1/auth/health | Diagnóstico relacional de desarrollo con opt-in |
| GET | /api/v1/maps/health | Diagnóstico de desarrollo con opt-in, dos motores |
| GET | /api/v1/marketplace/physicalgoods/health | Diagnóstico de desarrollo con opt-in |
| GET | /api/v1/marketplace/elibrary/health | Diagnóstico de desarrollo con opt-in |
| GET | /api/v1/reports/health | Diagnóstico de desarrollo con opt-in |
| GET | /api/v1/analytics/health | Diagnóstico de desarrollo con opt-in, dos motores |
| GET | /api/v1/maps/:campusId/active | Lectura existente para Expo; control completo de acceso aún pendiente |

Los diagnósticos no tienen un permiso administrativo inventado: son rutas técnicas exclusivas del entorno de desarrollo. Mantener ese entorno en una red de desarrollo controlada. En producción o cuando el opt-in está deshabilitado, responden 404 porque no están registrados.

Éxito de un módulo (200):

~~~json
{"data":{"module":"maps","status":"ok","dependencies":{"supabase":"ok","mongodb":"ok"}}}
~~~

Fallo de dependencia (503):

~~~json
{"error":{"code":"DEPENDENCY_UNAVAILABLE","message":"A required dependency is unavailable"}}
~~~

Ready devuelve data.status y data.modules con las siete sondas cuando todas están disponibles; ante cualquier fallo devuelve el error genérico 503. Las respuestas llevan Cache-Control: no-store; la caché interna breve comparte comprobaciones concurrentes y limita la carga.

Las rutas usan `{ error: { code, message, details? } }` para errores y `{ data, meta? }` para éxitos. El manejador común normaliza JSON inválido, cuerpos demasiado grandes y excepciones; no devuelve detalles de bases de datos. F2.2-04 incorpora validadores reutilizables, errores tipados y utilidades de paginación (`page` desde 1, `limit` por defecto 20 y máximo 100). Los listados deben validar los parámetros y calcular `hasMore` leyendo hasta `limit + 1` elementos.

## Contrato de mapas y Expo

GET /api/v1/maps/:campusId/active exige `Authorization: Bearer <access_token>`, perfil vigente y capacidad general en el campus actual. Responde `200` con `{ data: <mapa> }`. Dentro de `data`, `buildings` permanece en la raíz del documento, el ObjectId se serializa como string y las fechas como ISO. Los errores utilizan el sobre común: sin sesión válida 401; campus distinto o acceso insuficiente 403; UUID inválido con sesión válida 400; mapa/campus vigente inexistente 404. Las respuestas no se cachean.

Después de autorizar al solicitante, consulta public.campus por id y activo=true mediante el cliente de servidor; solo después consulta el mapa ACTIVE. El servicio comprueba también el campus y estado del documento devuelto. Un campus de Mongo sin referencia relacional válida no se entrega.

`frontendclink/src/three/api/mapApi.ts` desenvuelve `data` y expone errores con status, code y details para conservar el uso del documento por la escena 3D. El cliente autenticado también consume respuestas con `data`.

El servidor no utiliza CAMPUS_ID, MAP_VERSION ni MAP_STATUS en el .env: eran parámetros del script de carga inicial eliminado. El campus solicitado llega en /api/v1/maps/:campusId/active, el repository filtra status=ACTIVE y la versión devuelta pertenece al documento almacenado en MongoDB. La misma API puede resolver distintos campus válidos sin cambiar el entorno del proceso.

## Diagnosticar un mapa que no carga

La ruta del mapa activo exige sesión autorizada en el campus vigente y dos datos compatibles:

1. Un registro en public.campus de Supabase con el UUID solicitado y activo=true.
2. Un documento en campus_maps de MongoDB con el mismo campusId y status=ACTIVE.

GET /api/v1/maps/:campusId/active devuelve 404 si falta cualquiera de esas referencias. Una conexión saludable o una colección existente no garantiza que haya contenido válido para ese campus. El health general solo confirma que HTTP responde.

Para el mapa actual:

~~~sh
curl -H "Authorization: Bearer <access_token>" http://localhost:3000/api/v1/maps/22222222-2222-4222-8222-222222222222/active
~~~

El campus San Andres está vinculado a DUOC UC en el proyecto Supabase configurado. La referencia se creó el 2026-10-08 para el UUID que ya usaba el mapa; no es una migración ni se crea automáticamente al arrancar. Si se cambia de proyecto Supabase/Atlas, preparar sus referencias válidas antes de consultar el mapa. El backend conserva el documento bajo `data`, el cliente Expo lo desenvuelve y la comprobación del campus debe mantenerse.

El frontend consume EXPO_PUBLIC_API_URL desde su propio entorno y utiliza el campus vigente de `/auth/me` y el token de la sesión. En un teléfono, la URL debe ser accesible desde ese dispositivo; localhost apunta al teléfono. Después de corregir un fallo de carga, usar Reintentar. Un 401/403 actualiza la identidad y los accesos visibles.

## Supabase y autenticación

F2.3-02 usa `dominio_institucional`, `campus` y `perfil_usuario` del esquema existente. Express valida el dominio DuocUC y el campus activo, confirma el correo mediante Supabase Auth y crea el perfil existente solo después de verificar la identidad. La migración no crea tablas ni columnas: ajusta RLS/permisos e integridad campus-institución y configura `duocuc.cl` en el catálogo actual. Si encuentra vacía la tabla temporal de la versión anterior, la elimina; si tiene registros, se detiene para protegerlos. Nombre y campus viajan como metadatos de Auth y el backend los vuelve a validar antes de crear el perfil; esos metadatos nunca conceden permisos. Consulta la [guía de instalación y comprobación](docs/institutional-registration.md).

El cliente técnico es compartido y nunca recibe una sesión de usuario. Si hay una clave de servidor, se utiliza para sondas y referencias; si no, se usa la clave pública con RLS. Una consulta vacía bajo RLS prueba que la operación terminó, no que el usuario pueda leer todas las filas. Una clave secret/service_role puede eludir RLS y nunca debe enviarse a Expo.

createUserSupabaseClient crea un contexto independiente con la clave pública y el Bearer del usuario. Antes de utilizarlo en futuras rutas protegidas se debe validar el JWT y los permisos vigentes; crear este cliente no verifica la identidad ni autoriza la acción.

F2.3-01 conecta `verifyAuthConnection(accessToken)` con `requireAuthentication` y `GET /api/v1/auth/me`. El middleware acepta un único header `Authorization: Bearer <access_token>`, verifica identidad en Supabase mediante `getUser(token)` y luego consulta perfil y asignaciones vigentes bajo RLS. No utiliza metadatos del JWT para conceder capacidades ni cachea estado, campus o permisos.

`/me` responde con `{ data: { userId, campusId, profile, roles, permissions, capabilities } }`. `profile` contiene únicamente `id`, `institucion_id`, `campus_id`, `nombre_completo`, `foto_path`, `verificado_en`, `estado_cuenta` y `deleted_at`. Cada rol o permiso tiene `{ id, name, campusId }`, conserva el campus de su asignación y excluye registros revocados. Los permisos explícitos se devuelven separados de los roles; `capabilities` conserva las cuatro opciones definidas en F2.3-03. La matriz aprobada y aplicada en F2.3-05/F2.3-06 se documenta en la guía de autorización. El endpoint no recibe un UUID del cliente ni devuelve tokens.

Credenciales ausentes, malformadas, inválidas o vencidas producen 401 `UNAUTHENTICATED` y `WWW-Authenticate: Bearer`. Un perfil ausente, suspendido, desactivado o eliminado produce 403 `FORBIDDEN`; fallos de Auth/PostgreSQL producen 503 `DEPENDENCY_UNAVAILABLE` sin detalles del proveedor. La respuesta incluye `Cache-Control: no-store`, también ante errores. En nuevas rutas, colocar `requireAuthentication` antes de la autorización por operación y la lógica de negocio; el contexto verificado queda en `response.locals.auth`.

Aplicar `src/database/supabase/migrations/f2_3_01_autenticacion.sql` mediante una conexión de propietario, después de las tablas relacionales existentes. Es una migración versionada, no un script de arranque ni el snapshot `CampusLink_Schema.sql`. Habilita RLS en perfil, asignaciones y sus catálogos; permite exclusivamente lecturas propias a `authenticated` y retira los privilegios directos de escritura de `anon`/`authenticated` para impedir autoasignaciones o cambios de estado. Incluye políticas restrictivas para que una política SELECT permisiva anterior no amplíe ese acceso. Flujos administrativos y de actualización de perfil futuros deberán definir sus contratos de escritura explícitos. No usa el secreto técnico del servidor para eludir estas políticas.

Expo incorpora `AuthProvider`, `useAuth()` y `getSupabaseClient()` bajo `src/features/auth`. Configurar `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (o el alias legado `EXPO_PUBLIC_SUPABASE_ANON_KEY`) y `EXPO_PUBLIC_API_URL` en `frontendclink/.env`. El cliente rechaza claves secret/service_role; un secreto nunca debe introducirse en una variable `EXPO_PUBLIC_*`, pues Expo la incluye en el bundle. Usa persistencia AsyncStorage en dispositivos, persistencia web del SDK y renovación mientras la aplicación está activa; restaura la sesión y consulta `/me` al cambiar la sesión o volver al primer plano. Las consultas canceladas no pueden restaurar un contexto anterior al cierre/cambio de sesión. `authenticatedRequest` adjunta el token actual únicamente a rutas relativas `/api/v1/` del backend configurado.

`useAuth()` expone `session`, `identity`, `status`, `error` y `refreshIdentity()`. Solo `status === 'ready'` ofrece un contexto de perfil utilizable; una sesión local por sí sola no autoriza operaciones. Los estados son `loading`, `signedOut`, `ready`, `forbidden`, `error` y `unconfigured`. `refreshIdentity()` descarta inmediatamente el contexto previo y repite la consulta. El SDK queda disponible para los flujos de registro/login/recuperación de F2.3-02/F2.3-03. La navegación protegida usa las capacidades actuales y el mapa también las exige en Express.

Decisión explícita del usuario (2026-10-08, GH-59/GH-61): ADMINISTRADOR tiene todas las capacidades en su campus asignado; USUARIO_AUTORIZADO tiene generales y los tres permisos adicionales independientes. El institucional verificado tiene generales en su campus vigente. Falta sincronizar el texto pendiente de F2.2-10/F2.3-05 con esta aprobación.

## Esquemas y verificaciones

CampusLink_Schema.sql es un snapshot de referencia, no una migración ejecutable. No se ejecuta durante el arranque. Las tablas deben estar aplicadas mediante las migraciones de F2.2-01. Las sondas actuales requieren campus_maps, activities, activity_participation y activity_interactions. El nombre singular activity_participation corresponde al modelo de Atlas informado por el usuario el 2026-10-08; el bootstrap documental histórico usa otro nombre y campos distintos para activities. No ejecutarlo para corregir conectividad.

Si querySrv falla con ECONNREFUSED, comprobar la resolución DNS del clúster. Durante el diagnóstico inicial ejecutado con Node directamente se necesitó un override DNS. La ejecución Docker actual se verificó con MONGODB_DNS_SERVERS vacío; conservarlo como opción si otra red lo requiere. El ajuste no cambia el DNS de Windows, la URI ni las credenciales, y no es obligatorio para otras redes. Reiniciar el backend tras cambiarlo; si se utiliza Docker, reconstruir/recrear el servicio para cargar el código y las variables nuevas.

Las sondas Mongo usan filtros exactos por nombre en listCollections: Atlas rechazó el filtro anterior con $in mediante código 8000. No se requieren cambios de permisos ni crear colecciones para resolver ese rechazo.

## Verificación manual

npm run typecheck valida únicamente src; npm run build genera el artefacto en dist. `npm test` ejecuta las pruebas HTTP de Auth con un proveedor simulado y las políticas RLS en PostgreSQL embebido (PGlite), usando las tablas relevantes del snapshot como fixture. Comprueba rechazo antes de consultar perfil, suspensión con el mismo token, revocaciones, separación por campus, fallos de dependencias y prevención de escrituras/lecturas ajenas. No modifica servicios externos. El arranque conserva las comprobaciones de dependencias antes de abrir el puerto.

Para comprobar los endpoints, iniciar el backend con NODE_ENV=development y HEALTH_DIAGNOSTICS_ENABLED=true y ejecutar:

~~~powershell
curl.exe http://localhost:3000/api/v1/health
curl.exe http://localhost:3000/api/v1/ready
~~~

health devuelve el estado del proceso sin consultar bases. ready comprueba las dependencias de los siete módulos y devuelve 200 con data.status=ok cuando todas están disponibles, o 503 ante un fallo. Las rutas individuales están en la tabla de rutas. En producción o sin el opt-in de desarrollo, ready y los health de módulos responden 404.

Las colecciones esperadas del modelo actual son campus_maps, activities, activity_participation, activity_interactions y moderation_logs. Las sondas requieren las cuatro primeras; moderation_logs corresponde a moderación. Una colección existente vacía es válida; una ausente falla. La API no crea colecciones ni aplica migraciones durante el arranque. Versionar el modelo, sus validadores e índices corresponde a F2.2-02.

## Publicación de recursos físicos (F2.4-01)

El módulo usa las tablas existentes `publicacion_recurso`, `recurso_fisico`, `archivo_publicacion`, `publicacion_carrera` y `publicacion_asignatura`. Las reglas permanecen en el servicio Express; el repositorio usa el pool PostgreSQL y Supabase Storage. Requiere `SUPABASE_DB_URL` y la clave de servidor ya existentes, además del bucket privado `publication-images`. No crea buckets, tablas ni columnas durante el arranque.

- `GET /api/v1/marketplace/physicalgoods/options`: campus vigente, categorías activas y asociaciones académicas ofrecidas en ese campus.
- `POST /api/v1/marketplace/physicalgoods`: cuerpo JSON con `title`, `description`, `condition` (`NUEVO`, `BUEN_ESTADO`, `USADO`, `DETERIORADO`), `categoryId`, `modality` (`VENTA`, `DONACION`), `price` y `careerId`/`subjectId` opcionales. `photo` contiene `name`, `mimeType` y `base64`. Venta exige precio numérico finito mayor que cero; donación exige precio ausente o null. La foto obligatoria admite JPEG/PNG/WebP hasta 5 MB, con validación de firma y codificación. Responde 201 con la publicación en `data`, estado `DISPONIBLE` y moneda CLP del esquema.
- `GET /api/v1/marketplace/physicalgoods/:publicationId/photo`: devuelve `data.url` firmada durante 60 segundos, después de comprobar campus, tipo físico y estado visible. El path/bucket se leen del registro; el cliente no los decide.

Los tres endpoints requieren sesión, cuenta habilitada y capacidad general del campus actual. El backend deriva propietario/campus y rechaza campos de ubicación, cantidad y privilegios. La carga usa un path exclusivo generado por el servidor. Después de cargar revalida perfil/roles/campus y catálogo dentro de la transacción; todas las relaciones se guardan o revierten juntas. Un fallo limpia la foto salvo que un COMMIT haya quedado confirmado por su referencia persistida. Si falla también la limpieza o no puede determinarse el resultado del COMMIT, se registra únicamente el UUID generado para revisión operativa; no se exponen credenciales ni se elimina una foto que puede estar referenciada.

Aplicar `src/database/supabase/migrations/f2_4_01_publicacion_fisica.sql` en instalaciones que aún no tengan estos permisos/RLS. El script es repetible y solo habilita RLS y ajusta privilegios de las tablas existentes para impedir acceso directo desde anon/authenticated; no contiene reglas de negocio ni modifica datos. En el proyecto configurado se verificó RLS activo y ausencia de lectura directa pública el 2026-10-13, sin ejecutar cambios remotos.

La categoría identifica el tipo de objeto físico, independientemente de condición, precio o carrera. El catálogo aprobado se carga mediante `src/database/supabase/migrations/f2_4_01_categorias_recurso_fisico.sql`: Libros y textos, Apuntes y material impreso, Materiales académicos, Instrumentos y herramientas, Tecnología y accesorios, Indumentaria académica y Otros. Solo inserta nombres ausentes en la tabla existente y conserva IDs/datos al repetirse. Las siete categorías se cargaron activas en el proyecto configurado el 2026-10-13. El formulario las consulta desde la API; usar Actualizar opciones después de cargar el catálogo.

Expo organiza el formulario en `features/marketplace/physicalgoods/{api,components,hooks,types}`. `expo-image-picker` compatible con SDK 57 permite seleccionar fotos en web/Android/iOS; el plugin configura permiso de fotos y deshabilita permisos de cámara/micrófono. La política de foto fue aprobada por el usuario para GH-38; la entrada F2.2-05 debe sincronizar esa decisión. Imágenes/categoría, búsqueda y detalle se describen a continuación; edición general y transacciones pertenecen a sus tickets posteriores.

## Imágenes y categoría de recursos físicos (F2.4-02)

El mismo módulo permite una galería con varias fotos y una principal, y modificar la categoría existente. Reutiliza `archivo_publicacion.orden` (principal=0), `deleted_at`, `recurso_fisico.categoria_id`, `publicacion_recurso.updated_at` y el bucket privado `publication-images`; no requiere nuevas tablas, columnas, dependencias ni SQL. Las siete categorías ya cargadas en F2.4-01 permanecen en su tabla normalizada (decisión FIS-04 resuelta por el usuario).

- `GET /api/v1/marketplace/physicalgoods?categoryId=<uuid>&mine=true&page=1&limit=20`: listado paginado del campus vigente. `categoryId` y `mine` son opcionales; `mine=true` filtra propietario actual. Desde F2.4-03 solo incluye DISPONIBLE, también al filtrar publicaciones propias. El contrato de búsqueda completo se describe a continuación.
- `GET /api/v1/marketplace/physicalgoods/:publicationId/images`: galería/detalle con título, categoría, condición, modalidad/precio, estado, `canEdit` y `images: [{id,name,principal,url}]`; URLs de 60 segundos. Permite consultar DISPONIBLE/RESERVADO/FINALIZADO del campus vigente. F2.4-04 amplía el mismo contrato como se describe más abajo.
- `POST /api/v1/marketplace/physicalgoods/:publicationId/images`: JSON `{photo:{name,mimeType,base64}}`, una imagen por solicitud, 201 `{data:{id}}`. Reutiliza JPEG/PNG/WebP, 5 MB, firma y codificación validadas; cuerpo máximo 7 MB parseado después de autenticar.
- `PATCH /api/v1/marketplace/physicalgoods/:publicationId/images/:imageId/principal`: cambia principal mediante intercambio de órdenes en una transacción. La ruta `/photo` existente sigue entregando la principal vigente.
- `DELETE /api/v1/marketplace/physicalgoods/:publicationId/images/:imageId`: retiro lógico. La última fotografía no se puede retirar; retirar la principal elige la siguiente en orden. Conserva referencia y bytes publicados, excluyéndolos de galería y nuevas firmas.
- `PATCH /api/v1/marketplace/physicalgoods/:publicationId/category`: JSON `{categoryId}`, valida categoría activa y guarda en el esquema existente.

Las lecturas requieren cuenta habilitada y capacidad general del campus vigente. Para modificar se exige propietario o ADMINISTRADOR vigente del mismo campus; el backend vuelve a leer cuenta/roles y bloquea la publicación para serializar cambios. UUID de una imagen debe pertenecer a esa publicación, estar activo y ser IMAGEN. Propiedad se verifica antes de cargar Storage y nuevamente antes de persistir; fallos de carga/registro compensan solo el archivo nuevo, preservando la publicación y evitando eliminar archivos referenciados tras COMMIT incierto.

Expo permite elegir varias imágenes y principal antes de crear. La publicación conserva el POST de F2.4-01 para la principal y carga adicionales una por una. Si falla una adicional, informa que el recurso ya está publicado y ofrece reintentar las pendientes sin repetir su creación. Después, Recursos del campus permite filtrar categoría/ver publicaciones propias y abrir galería con edición autorizada, agregado de fotos y retiro lógico. URLs visibles se refrescan a los 50 s; el frontend deriva el permiso de edición del servidor y se desmonta al cambiar sesión/campus. QA real dentro de aplicación está diferido al cierre de fase por acuerdo del usuario.

## Búsqueda de recursos físicos disponibles (F2.4-03)

Extiende el `GET /api/v1/marketplace/physicalgoods` existente, sin migraciones, tablas, columnas ni dependencias nuevas. Todas las consultas derivan el campus de la identidad autenticada y excluyen digitales, otros campus y cualquier publicación retirada o cuyo estado no sea DISPONIBLE, incluso con `mine=true`.

- Filtros opcionales: `q` (hasta 200 caracteres; todas las palabras deben aparecer en título o descripción, sin distinguir mayúsculas), `categoryId`, `modality` (`VENTA`/`DONACION`), `condition` (`NUEVO`/`BUEN_ESTADO`/`USADO`/`DETERIORADO`), `careerId`, `subjectId`, `minPrice`, `maxPrice` y `mine=true`. IDs UUID; precios decimales no negativos y rango inclusivo. Un precio limita a ventas; combinar precio y DONACION devuelve 400. Caracteres `%`, `_` y barra inversa en `q` se buscan literalmente. No ofrece búsqueda aproximada ni eliminación de tildes.
- Paginación compartida `page`/`limit` (predeterminados 1/20, máximo 100), con orden estable por fecha e ID y `meta: {page,limit,hasMore}`. Las asociaciones académicas se filtran con EXISTS para evitar duplicados.
- Cada resultado contiene `id`, `title`, `category`, `condition`, `modality`, `price`, `status` e `imageUrl`. La principal activa se firma por 60 segundos después de validar campus/bucket; se firman en lote solo fotos de la página devuelta. Sin principal activa, `imageUrl` es null. No expone referencias privadas de almacenamiento. Errores de dependencias devuelven 503 sin detalles internos; la respuesta mantiene `Cache-Control: no-store`.

Marketplace abre en Explorar recursos. El formulario de filtros se aplica con Buscar recursos y reinicia la página; Limpiar filtros restablece la consulta. El rango solo aparece para ventas/modalidad sin especificar y se limpia al seleccionar Donación. Muestra principal, nombre, categoría, condición y modalidad/precio, mensaje vacío, controles de página y acceso a la galería existente, que vuelve a consultar el estado vigente. Alternar a Publicar un recurso conserva el borrador. El hook cancela respuestas anteriores y renueva URLs visibles a los 50 segundos; la identidad/campus/sesión cambia la clave del componente.

Validación local de búsqueda: 300 pruebas backend, TypeScript/build, exportaciones web/Android/iOS y QA web automatizada a 390×844 y 1280×900 con APIs simuladas. Pruebas dentro de la aplicación real al cierre de fase por acuerdo del usuario. El detalle se amplía en F2.4-04; solicitudes siguen en F2.4-06.

## Detalle de recursos físicos (F2.4-04)

Se amplía el GET `/:publicationId/images` y el modal existentes para consultar la ficha completa sin un endpoint o flujo de fotos paralelo. Además del contrato previo devuelve `description`, `campus: {id,name}`, `owner: {id,fullName}` y `acceptsRequests`. Son datos derivados del esquema actual: descripción de la publicación, campus de origen y nombre completo del perfil del propietario. No requiere migraciones, nuevas tablas/columnas, dependencias ni variables de entorno.

El servicio exige capacidad general y el repositorio restringe por UUID, FISICO, campus vigente, estado visible y ausencia de retiro lógico antes de consultar/firmar fotos. `acceptsRequests` indica exclusivamente que el recurso está DISPONIBLE; RESERVADO/FINALIZADO siguen consultables y devuelven false. El campus mostrado es el registrado en la publicación aunque el propietario cambie su campus de perfil. Del propietario solo se proyectan UUID y nombre completo: no se consulta Auth, contacto, domicilio, origen, fecha de nacimiento ni referencias de avatar. Las fotos conservan firma privada60s y permisos de edición de F2.4-02.

El frontend muestra descripción, condición, categoría, fotos/principal, modalidad y precio solo en ventas, propietario, campus y estado con disponibilidad explícita. Cada apertura consulta el servidor; Actualizar detalle y renovación a50s retiran los datos anteriores mientras cargan. Un404 o fallo deja error/reintento sin ficha ni disponibilidad vieja, y respuestas de recursos cerrados no se aplican al siguiente. F2.4-06 incorpora envío con nueva comprobación de disponibilidad en servidor; la lectura del detalle no constituye una reserva ni autorización para un envío posterior.

Validación local acumulada: 305/305 pruebas backend (37 físicas), TypeScript/build, exportaciones web/Android/iOS y QA web automatizada390×844/1280×900. Pruebas nuevas cubren contrato público mínimo, datos vigentes, campus original, donación sin precio, estados cambiados, aislamiento/cuenta/no-store y fallo de firma. QA simulada verifica detalle/errores/retirada/cancelación de lecturas y regresión de búsqueda, creación, principal, retiro/agregado y categoría. Sin cambios remotos ni SQL requerido; QA real dentro de aplicación se mantiene diferida al cierre de fase.

## Edición y retirada de recursos físicos (F2.4-05)

El detalle permite al propietario habilitado editar nombre, descripción, condición, modalidad y precio. Conserva las acciones de fotos/categoría existentes; no cambia propietario, campus, moneda ni asociaciones académicas. Venta exige precio finito mayor que cero; donación exige precio null/ausente y la UI lo limpia al cambiar modalidad. Ambas modalidades siguen siendo válidas para edición. Los acuerdos de `transaccion_recurso` y sus solicitudes nunca se actualizan desde esta operación, incluso si el recurso está RESERVADO/FINALIZADO.

- `GET /:publicationId/images` añade `updatedAt`, leído con seis decimales de la columna existente. Se conserva como texto opaco; no convertirlo a Date en el cliente.
- `PATCH /api/v1/marketplace/physicalgoods/:publicationId`: JSON `{title,description,condition,modality,price,updatedAt}`; responde `{data:{id}}` y el cliente recarga el detalle/lista. Validación reutiliza reglas de publicación. Versión anterior devuelve409, sin sobrescribir cambios.
- `DELETE /api/v1/marketplace/physicalgoods/:publicationId`: JSON `{updatedAt}`; retirada lógica mediante `deleted_at`, sin cambiar estado ni borrar datos/Storage/solicitudes/transacciones. Desaparece de búsquedas, fotos y detalle público; futuros envíos de solicitudes deben excluir retiradas. Historial propio completo corresponde F2.4-09.

Estas dos acciones exigen propietario real, cuenta/capacidad general vigente y mismo campus, comprobados nuevamente bajo bloqueo de perfil/publicación. No conceden edición general a administradores ajenos; estos conservan permisos existentes para imágenes/categoría. UUID inaccesible produce404, validación400, identidad401, cuenta/propietario403, conflicto409 y fallo de dependencia503 sanitizado. Respuestas no-store. La UI ofrece cancelación, conserva el borrador ante fallo y permite recargar explícitamente para resolver conflictos; la retirada tiene confirmación y cierra el detalle al completarse.

La creación, cada cambio relevante (incluidas fotos/principal/categoría) y retirada registran snapshots anterior/posterior en `auditoria` dentro de la misma transacción que el recurso. Actor/institución/campus/fecha identifican la operación; imágenes guardan IDs y metadatos, sin bytes, URLs temporales ni paths privados. No-op no agrega versiones. Un fallo de auditoría revierte toda la operación; altas/cargas nuevas compensan Storage como antes. El historial se consulta mediante la auditoría administrativa autorizada existente, que proyecta solo campos conocidos, conserva snapshots tras retiro y no rehidrata datos desde entidades actuales. Para registros anteriores se conserva el estado encontrado antes del primer cambio; no se inventan versiones previas inexistentes.

**Instalación:** `src/database/supabase/migrations/f2_4_05_edicion_fisica.sql` requiere las migraciones físicas y de auditoría anteriores. Amplía el CHECK de `auditoria.accion` con PUBLICAR_PUBLICACION/EDITAR_PUBLICACION/RETIRAR_PUBLICACION y otorga al servidor UPDATE de columnas ya existentes. Conserva acciones/datos y es repetible; no crea tablas, columnas, triggers ni funciones. El usuario confirmó su ejecución en Supabase y se verificó como se detalla a continuación. En nuevas instalaciones, sin ese CHECK actualizado las altas y cambios auditados fallarán con503 y se revertirán.

Verificación posterior2026-10-14: el usuario ejecutó los scripts GH-68 y `f2_3_08_auditoria.sql`; se confirmó remotamente en modo solo lectura el CHECK de14 acciones,8 permisos de edición, RLS/bloqueo cliente/bucket privado y protección histórica. service_role tiene SELECT/INSERT sobre auditoria y carece de UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER. No es necesario repetir esos scripts. Las verificaciones del agente no modificaron Supabase.

Validación local:313/313 pruebas backend (45 físicas), TypeScript/build, exportaciones web/Android/iOS y QA web en390×844/1280×900. Cubre venta/donación, propietario/campus/cuenta, conflictos, acuerdos de transacción intactos tras reserva/retirada, historia autorizada, rollback/compensación y migración repetible sin nuevos atributos. QA real dentro de aplicación al cierre de fase según acuerdo del usuario.

## Solicitar un recurso físico (F2.4-06)

Reutiliza `mensaje_solicitud` y `solicitud_recurso`: guarda solicitante/publicación/opción/fecha y vincula propietario/campus por la publicación de origen inmutable. No duplica columnas ni crea tablas, índices, dependencias, conversación o permisos. Solicitar crea PENDIENTE sin reservar ni modificar términos/updated_at del recurso.

- `GET /api/v1/marketplace/physicalgoods/:publicationId/request-options`: `{data:{canRequest,activeRequest,messages:[{code,label}]}}`. Catálogo activo del servidor y solo solicitud propia. canRequest=false para propietario, RESERVADO/FINALIZADO o solicitud activa existente; UUID inaccesible, digital u oculto/cancelado/retirado devuelve404.
- `POST /api/v1/marketplace/physicalgoods/:publicationId/requests`: JSON exacto `{messageCode}`,201 `{data:{id,publicationId,requesterId,ownerId,campusId,messageCode,status:'PENDIENTE',requestedAt}}`. Identidad/relaciones/fecha de servidor, no-store; rechaza texto libre/campos privilegiados y código inactivo/inexistente.

Servicio revalida perfil/cuenta/roles/campus en transacción, bloquea publicación con el mismo FOR UPDATE de edición/retirada y comprueba DISPONIBLE, propietario ajeno, ausencia de solicitud activa y catálogo antes de INSERT. Valida mensaje con FOR SHARE. PENDIENTE/ACEPTADA son activas; RECHAZADA/CANCELADA se conservan y permiten nueva solicitud. Diferentes solicitantes pueden expresar interés. F2.4-07/08 deben usar el lock de publicación y mantener coherentes los estados al cerrar solicitudes/transacciones. F2.4-09 completa vistas históricas.

400 entrada/código;401 sesión;403 cuenta/capacidad/recurso propio;404 inaccesible;409 contexto/disponibilidad/duplicado;503 dependencia sanitizada y rollback. Si COMMIT ocurrió pero se perdió la respuesta, GET descubre la solicitud ya registrada y evita reenvío. UI del detalle exige opción, bloquea doble clic, conserva selección ante fallo, muestra recibo y cancela lecturas/envíos al cerrar/cambiar recurso;404/409 refresca detalle vigente. Fotos/categoría/edición/retirada existentes conservadas.

**Catálogo verificado:** el usuario ejecutó `src/database/supabase/migrations/f2_4_06_mensajes_solicitud.sql` y se confirmó en Supabase2026-10-14 que los tres mensajes están activos con sus etiquetas correctas. El repositorio real del backend los lee; las tres tablas de mensajes/solicitudes/transacciones tienen RLS/permisos servidor correctos y acceso directo de clientes bloqueado, con cero grupos duplicados activos. El agente solo consultó; no ejecutó seed ni creó solicitudes remotas. No es necesario repetir SQL. En instalaciones nuevas el script carga3 mensajes únicamente si el catálogo está vacío y preserva catálogos existentes; sin opciones activas la UI informa ausencia y deshabilita envío.

Validación local:322/322 tests backend (54 físicos), TypeScript/build, exports web/Android/iOS y QA Edge390×844/1280×900 con APIs ficticias. Cubre aislamiento/estado/propiedad, mensajes, historia, doble envío HTTP, rollback/COMMIT incierto y regresión de edición/fotos/categoría/retirada. PGlite usa una conexión serializada; no se probó contención de locks con múltiples conexiones remotas. QA real de app al cierre de fase por acuerdo usuario.

## Trabajo posterior

- Implementar flujos de negocio bajo sus tareas de backlog, con autorización explícita y campus vigente.
- Aplicar las comprobaciones compartidas de autorización al crear nuevos endpoints y mantener sincronizado el catálogo aprobado con el backlog.
- Completar eventos de recursos/transacciones/cuentas y tableros para KPI; el log de actividades ya registra VIEWED/JOINED/LEFT. El health no demuestra cobertura analítica.
- Integrar moderación de actividades en reports cuando corresponda; su health inicial comprueba el registro relacional de denuncias.

## Referencias técnicas

[Inicialización Supabase JS](https://supabase.com/docs/reference/javascript/initializing), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [Auth en React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y [opciones de MongoDB Node](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/).
