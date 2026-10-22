# CampusLink Backend

Ciclo de vida de actividades: finalización automática y reactivación.
Al llegar endAt, comunitarias/oficiales pasan a FINISHED en Mongo mediante el
mantenimiento al arrancar y cada minuto, sin borrar documentos ni participaciones.

Denuncias F2.6-09: API, persistencia común y QA manual. `POST /api/v1/reports/activities/:activityId` guarda PENDIENTE en `reporte_contenido`, con motivo libre, descripción opcional y copia del contenido; no modifica actividades ni inscripciones. Revisión administrativa corresponde a F2.6-10. Sin migraciones ni colecciones nuevas.

Base API REST de F2.2-03 (GitHub #50). Node.js 22, TypeScript, Express 5, Supabase JS y driver oficial MongoDB. Las rutas se montan en /api/v1.

Actividades del mapa F2.6-01: `GET /api/v1/activities` requiere Bearer y autorización general del campus vigente. Admite `buildingKey`, `floorKey` y `poiKey` como filtros de la jerarquía; un filtro de piso requiere edificio y un filtro de POI requiere piso. No acepta campus, tipo, estado o visibilidad enviados por el cliente. Responde `{ data: ActivityDto[] }`, con fechas ISO y nombres de ubicación resueltos desde el mapa activo.

Detalle F2.6-02 y participación mínima: endpoints, contrato JOINED/LEFT, índice único y transacción. `GET /api/v1/activities/:activityId` añade organizador y participación propia; `PUT /api/v1/activities/:activityId/participation` inscribe sin cuerpo ni identidad del cliente.

Participación F2.6-07: inscripción, retiro y consulta propia. GET/DELETE en `/:activityId/participation` consultan el estado o retiran al usuario autenticado, incluso después del término. El retiro guarda LEFT y descuenta el contador una sola vez; la reinscripción vigente conserva el mismo registro. Sin nuevas colecciones.

Interacciones F2.6-07/F2.7-01: estado actual, log append-only y migración. JOINED/LEFT se registran junto al estado y contador en transacciones; VIEWED registra aperturas reales de ficha, sin contar tarjetas ni refresh. Métricas futuras consultan `activity_interactions`; el historial migrado está identificado como parcial.

Notificaciones F2.6-08: entrega durable y bandeja propia. Eventos pendientes embebidos en activities y entrega idempotente a notificacion existente. Una serie oficial genera un aviso al inicio real de cada ocurrencia, incluida la primera, con título/mensaje de publicación individual y sin textos de recurrencia. Guardar fechas futuras o terminar la anterior no anticipa el aviso. Cada aviso abre su actividad concreta con acceso general del campus. Cambios conjuntos se agrupan por usuario afectado, con motivos/cantidad propios. Bandeja GET/PUT lectura/DELETE bajo `/api/v1/users/me/notifications`; aplicar migración base `f2_6_08_notificaciones.sql`. Esta evolución no requiere migración adicional, colecciones nuevas ni cambios de RLS/permisos.

Creación F2.6-03: contrato comunitario, `POST /api/v1/activities`. Publicación F2.6-04: contrato oficial y autorización por campus, `POST /api/v1/activities/official`. Ambas comparten validación/ubicación/transacción e inscriben al creador JOINED; el servidor fija el tipo. USUARIO_AUTORIZADO necesita PUBLICAR_EVENTO del campus vigente para publicar oficialmente; ADMINISTRADOR conserva acceso automático aprobado.

Recurrencia F2.6-05: vista previa, calendario, API e índice de ocurrencias. Repetición diaria/semanal/mensual con fecha final y exclusiones, preservando hora local. La definición de serie queda en `activities.seriesDefinition` de la primera ocurrencia; publicar inserta actividades y creador JOINED en una transacción. `003_activity_series.mongosh.js` configura únicamente el índice existente de ocurrencias; no crea colecciones ni se ejecuta al arrancar.

Edición F2.6-06: vista previa, revisiones e historial embebido. El creador edita contenido, fechas y lugar de una sola actividad u ocurrencia, conservando tipo e inscripciones. `POST /api/v1/activities/:activityId/edit/preview` revisa cambios; `PATCH /api/v1/activities/:activityId` exige esa confirmación. Ambas aceptan únicamente `scope: 'ONE'` y rechazan edición grupal. El historial se añade a `activities.changeHistory` en la misma actualización. No se crean colecciones nuevas. La reparación de las colecciones anteriores ya se aplicó y su herramienta fue retirada; la evidencia queda en `context/tasks/LOCAL-20261010-activities-existing-collections/`.

Contrato de lectura acordado: `type` es `COMMUNITY_ACTIVITY` u `OFFICIAL_EVENT`, `status` es `ACTIVE`, `visibility` es `PUBLIC` y `endAt` es posterior al momento de consulta. Incluye actividades futuras y en curso con fechas válidas. Cada actividad debe referenciar `location.buildingKey = building.id` y `location.floorKey = floor.id`; `poiKey` es opcional y debe pertenecer al piso y estar visible/no eliminado. `meshName` solo vincula geometría 3D. No ejecutar el bootstrap documental histórico como migración de este contrato. Esta entrega no crea actividades ni índices/validadores remotos.

Inicio/cierre/recuperación de sesión F2.3-03: contratos, permisos, plantilla y configuración de Supabase.

Perfil académico F2.3-04: API, validaciones, guardado transaccional y migración necesaria en Supabase.

Roles y permisos por campus F2.3-05: administración mediante `/api/v1/users/access`, con alcance vigente, listado paginado y auditoría atómica. Requiere `SUPABASE_DB_URL`, administrador previamente incorporado y `src/database/supabase/migrations/f2_3_05_roles_permisos.sql`. Guía local.

Autorización F2.3-06: políticas por ruta, comprobaciones de permiso/campus/propietario y guía para servicios futuros. El mapa ahora exige Bearer y campus vigente. No requiere SQL nuevo.

Suspensión/desactivación F2.3-07: acciones de cuenta, auditoría, retirada física y conservación digital. Desde Administrar cuentas y accesos; PATCH dedicado `/users/access/campuses/:campusId/users/:userId/state`. Aplicar `src/database/supabase/migrations/f2_3_07_estado_cuenta.sql`: solo permisos/RLS sobre publicaciones existentes, sin tablas/columnas nuevas. El guardado revalida al administrador bajo transacción.

Auditoría F2.3-08: consulta del historial administrativo por campus. Desde Mi perfil → Historial administrativo; GET `/users/access/campuses/:campusId/audit` y `/audit/:auditId`. Aplicar `src/database/supabase/migrations/f2_3_08_auditoria.sql` después de F2.3-05: lectura/inserción del servidor y bloqueo de acceso directo cliente sobre `auditoria` existente. Sin tablas ni columnas nuevas.

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
| analytics | Supabase: interaccion_recurso, solicitud_recurso, transaccion_recurso, confirmacion_transaccion y auditoria; MongoDB: activities y activity_interactions |

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

### Modelo de cuatro pisos de cabañas (GH-35 / F2.1-01)

El GLB incluido desde el 2026-10-20 representa las cabañas A/B/C con pisos físicos
1, -1, -2 y -3. Los IDs existentes siguen siendo `cabin03`/`cabin02`/`cabin01`;
los tres pisos históricos conservan sus `floor.id` y `meshName` para mantener
actividades y POI en la misma ubicación física:

| meshName histórico | Nivel físico actual | Submallas |
| --- | --- | --- |
| `cabinNN_floor1` | -2 | `cabinNN_floor1_Mesh001…` |
| `cabinNN_floor2` | -1 | `cabinNN_floor1_Mesh…` |
| `cabinNN_floor3` | 1 | `cabinNN_floor2_Mesh…` |
| `cabinNN_floor-3` (nuevo) | -3 | `cabinNN_floor1_Mesh002…` |

`src/database/mongodb/006_cabin_basement.mongosh.js` sincroniza manualmente el mapa
ACTIVE existente. Antes de aplicarlo, respaldar el documento completo en EJSON
fuera de Mongo y verificar el preview. Desde mongosh, tras elegir la base existente:

~~~javascript
globalThis.CABIN_BASEMENT_CAMPUS_ID = '22222222-2222-4222-8222-222222222222';
load('src/database/mongodb/006_cabin_basement.mongosh.js'); // solo preview
// Después de revisar el preview y conservar el respaldo:
globalThis.CABIN_BASEMENT_APPLY = true;
load('src/database/mongodb/006_cabin_basement.mongosh.js');
~~~

Una sola actualización compara la jerarquía original y rechaza modificaciones
concurrentes, sin upsert. Conserva `_id`, campus, versión, estado, IDs, claves POI,
visibilidad, imágenes y metadata. Añade solo tres pisos vacíos, ordena las cabañas
por altura (-3, -2, -1, 1) y corrige menciones explícitas del nivel anterior en sus
descripciones de piso/POI; no modifica actividades, participaciones ni su historial.
También sincroniza los transforms de los demás pisos con el mismo export, incluidos
los cambios de CTI y G, y ajusta el encuadre de CTI/cabañas para mostrar sus límites
en pantalla vertical con FOV 50°. Los campos `model.sourceHash`/`dataSource` conservan
su procedencia histórica; no se reinterpretan como hash del nuevo GLB.

La segunda ejecución sin cambios no escribe. No se crean colecciones, versiones,
índices ni validadores. No ejecutar el bootstrap legado `001` para esta operación:
usa otro contrato y restringe los niveles a valores positivos. Tras aplicar,
recargar la aplicación para renovar el mapa almacenado en memoria.

El inventario `004_campus_poi_inventory.mongosh.js` identifica los pisos históricos
de cabañas por `meshName` estable, por lo que admite tanto el mapa anterior como el
migrado. Conserva las claves/fotos existentes y no interviene los nuevos pisos -3.
El catálogo tiene 17 POI: incluye Enfermería en E1 y Patio de comidas en F1,
con `imageKeys` de fotografías locales. Las 15 claves anteriores se conservan;
las fotos finales y su manifiesto están documentados en
[poimages/README.md](../frontendclink/assets/images/poimages/README.md).
Las pruebas de `cabin-basement.test.ts` comparan los 36 pisos con el JSON del GLB
empaquetado y comprueban preservación de datos, preview, idempotencia y concurrencia.

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

F2.3-02 usa `dominio_institucional`, `campus` y `perfil_usuario` del esquema existente. Express valida el dominio DuocUC y el campus activo, confirma el correo mediante Supabase Auth y crea el perfil existente solo después de verificar la identidad. La migración no crea tablas ni columnas: ajusta RLS/permisos e integridad campus-institución y configura `duocuc.cl` en el catálogo actual. Si encuentra vacía la tabla temporal de la versión anterior, la elimina; si tiene registros, se detiene para protegerlos. Nombre y campus viajan como metadatos de Auth y el backend los vuelve a validar antes de crear el perfil; esos metadatos nunca conceden permisos. Consulta la guía de instalación y comprobación.

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
- `POST /api/v1/marketplace/physicalgoods/:publicationId/images`: JSON `{photo:{name,mimeType,base64}}`, una imagen por solicitud, 201 `{data:{id}}`. Máximo tres imágenes activas por publicación, incluida la principal; al completar el límite responde 409 `CONFLICT` antes de Storage y vuelve a verificar el cupo bajo lock al persistir para cubrir cargas simultáneas. Retirar una imagen libera cupo conservando su historial. Las publicaciones previas con más de tres conservan sus archivos y requieren retirar imágenes antes de agregar nuevas. Reutiliza JPEG/PNG/WebP, 5 MB, firma y codificación validadas; cuerpo máximo 7 MB parseado después de autenticar.
- `PATCH /api/v1/marketplace/physicalgoods/:publicationId/images/:imageId/principal`: cambia principal mediante intercambio de órdenes en una transacción. La ruta `/photo` existente sigue entregando la principal vigente.
- `DELETE /api/v1/marketplace/physicalgoods/:publicationId/images/:imageId`: retiro lógico. La última fotografía no se puede retirar; retirar la principal elige la siguiente en orden. Conserva referencia y bytes publicados, excluyéndolos de galería y nuevas firmas.
- `PATCH /api/v1/marketplace/physicalgoods/:publicationId/category`: JSON `{categoryId}`, valida categoría activa y guarda en el esquema existente.

Las lecturas requieren cuenta habilitada y capacidad general del campus vigente. Para modificar se exige propietario o ADMINISTRADOR vigente del mismo campus; el backend vuelve a leer cuenta/roles y bloquea la publicación para serializar cambios. UUID de una imagen debe pertenecer a esa publicación, estar activo y ser IMAGEN. Propiedad se verifica antes de cargar Storage y nuevamente antes de persistir; fallos de carga/registro compensan solo el archivo nuevo, preservando la publicación y evitando eliminar archivos referenciados tras COMMIT incierto.

Expo permite elegir hasta tres imágenes, incluida la principal, antes de crear. El contador y el selector consideran los cupos restantes y deshabilitan agregar al llegar al máximo; web también valida la cantidad elegida porque el selector del navegador no aplica el límite nativo. La publicación conserva el POST de F2.4-01 para la principal y carga adicionales una por una. Si falla una adicional, informa que el recurso ya está publicado y ofrece reintentar las pendientes sin repetir su creación. Después, Recursos del campus permite filtrar categoría/ver publicaciones propias y abrir galería con edición autorizada, agregado de fotos y retiro lógico. URLs visibles se refrescan a los 50 s; el frontend deriva el permiso de edición del servidor y se desmonta al cambiar sesión/campus. QA real dentro de aplicación está diferido al cierre de fase por acuerdo del usuario.

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

## Resolver solicitudes recibidas (F2.4-07)

Marketplace incorpora Solicitudes recibidas y Mis solicitudes. Ambas son vistas propias y paginadas; F2.4-09 amplía su lectura al historial completo y a campus anteriores. Las acciones operacionales siguen sujetas al campus vigente. Permiten abrir un recurso RESERVADO del campus actual sin ampliar la búsqueda pública, que sigue exigiendo DISPONIBLE. La gestión pertenece exclusivamente al propietario, con confirmación previa; los demás solicitantes pueden seguir consultando su estado pendiente.

- `GET /api/v1/marketplace/physicalgoods/received-requests` y `/sent-requests`: admiten únicamente `page`/`limit`, envelope `{data:[{id,publication:{id,title,status,modality,price},requester:{id,fullName},message,messageCode,status,requestedAt,transaction:{id,status}|null}],meta}`. Relaciones/actor/campus se determinan en servidor. No correos, perfiles privados ni solicitudes ajenas; el solicitante pendiente no recibe el acuerdo elegido de otra persona.
- `PATCH /api/v1/marketplace/physicalgoods/:publicationId/requests/:requestId`: cuerpo exacto `{decision:'ACEPTAR'|'RECHAZAR'}`. Solo PENDIENTE y propietario habilitado; solicitud ajena al recurso404, resolución repetida/conflicto409. Rechazar conserva el registro y no cambia la publicación. Aceptar requiere DISPONIBLE y ausencia de acuerdo activo, inserta `transaccion_recurso` con términos vigentes copiados del servidor, marca ACEPTADA y RESERVADO, avanza versión y audita todo atómicamente. Las demás solicitudes permanecen PENDIENTE.
- Base de los efectos de cierre definidos aquí y utilizados por F2.4-08: `POST /:publicationId/transactions/:transactionId/confirm` y `/cancel`, cuerpo exacto `{}`, solo participantes del acuerdo en su campus. Confirmar registra rol/actor/fecha una vez; una parte deja PENDIENTE_CONFIRMACION y RESERVADO, ambas completan/FINALIZADO y cierran otras PENDIENTE como CANCELADA (estado ya existente). Cancelar registra actor/fecha, cierra la elegida como CANCELADA y devuelve DISPONIBLE; las demás siguen pendientes. Reintentar la misma transición terminal no escribe otra vez ni libera una reserva posterior. No se admite cancelar una completada ni confirmar una cancelada.

El lock de perfil es FOR NO KEY UPDATE: protege cuenta/campus pero permite referencias FK del receptor, evitando una espera circular con su consulta simultánea. Publicación/subtipo conserva FOR UPDATE; solicitud/transacción se bloquean después. Acuerdo, confirmaciones, estados y auditoría usan la misma transacción SQL y revierten juntos ante error; COMMIT incierto se recupera consultando la lista. Cambiar contenido/precio/retirar después de aceptar conserva el acuerdo original. Cerrar acuerdos retirados conserva deleted_at y no sobrescribe estados de moderación.

**Sin SQL nuevo:** verificación Supabase en modo READ ONLY2026-10-14 confirmó RLS y bloqueo de anon/authenticated en publicación/solicitud/transacción/confirmación, SELECT/INSERT servidor y UPDATE para todas las columnas de estados/fechas/actor utilizadas. No se modificaron registros remotos, buckets, tablas, columnas, índices ni dependencias.

Validación local:335/335 pruebas backend (67 físicas), TypeScript/build, exports web/Android/iOS y QA Edge390×844/1280×900 con API simulada: resolución/reintento/doble clic/resultado incierto/conflictos/paginación/acceso a reservado/consulta de otros pendientes y regresión de fotos/contenido/retirada. Interfaz de confirmar/cancelar y coordinación por edificios/pisos pertenece a F2.4-08; historial completo de retiradas/campus anteriores a F2.4-09. QA real de aplicación al cierre de fase según acuerdo del usuario.

## Confirmar o cancelar una transacción física (F2.4-08)

Desde Solicitudes recibidas o Mis solicitudes, «Ver acuerdo» abre términos originales, participantes, estado, fechas y confirmaciones. Cada participante confirma o cancela con una decisión explícita; una confirmación mantiene reserva, ambas completan/finalizan y cierran pendientes restantes. Cancelar registra actor/fecha y libera la reserva, preservando retirada/moderación. Reutiliza las transiciones atómicas de F2.4-07. Acuerdos propios de publicaciones retiradas u ocultas siguen accesibles desde las listas; `publication.canView` impide abrir su detalle público excluido. F2.4-09 incorpora historia completa y consulta de campus anteriores.

Bajo `/api/v1/marketplace/physicalgoods/:publicationId/transactions/:transactionId`:

- `GET /`: detalle propio con publicación/campus/participantes, rol, términos acordados, fechas, confirmaciones y `canConfirm`/`canCancel`. No contactos privados/Storage ni transacciones ajenas, incluso para administradores no participantes.
- `POST /confirm` y `/cancel`: mantienen cuerpo exacto `{}` y reglas de F2.4-07. Actor/cuenta/campus se revalidan bajo locks; acciones terminales opuestas409 y reintento equivalente idempotente.
- `GET /coordination-options`: `{data:{buildings:[{id,name,floors:[{id,name}]}]}}` del mapa ACTIVE de Mongo del campus vigente. Sin mapa devuelve lista vacía, fallos503 independientes del cierre SQL. Identificadores/nombres visibles y no ambiguos; conserva nombres de pisos negativos/Planta Baja.
- `GET /messages?page=1&limit=10`: envelope paginado `{data:[{id,senderId,recipientId,text,createdAt}],meta}` de coordinación propia, también tras cierre. Fechas UTC con seis decimales.
- `POST /messages`: cuerpo exacto `{buildingId,floorId}`,201 recibo del mensaje. Backend valida pertenencia al mapa/edificio/piso y construye «Estoy en {edificio}, en {piso}.». Destinatario es el otro participante y fecha procede del servidor; no texto libre, identidad/fecha inyectada ni envío nuevo tras cierre.

Coordinación reutiliza exclusivamente columnas originales de `notificacion`, tipo `COORDINACION_RECURSO`; no agrega remitente: se deriva del participante opuesto al destinatario en el acuerdo inmutable de dos personas. No usa campos/eventos de actividades ni mezcla sus avisos. Texto guardado conserva nombres históricos. Mongo se consulta sin locks SQL; antes del INSERT se revalidan actor/campus/acuerdo. Confirm/cancel/detalle/mensajes guardados funcionan aunque Mongo falle. UI bloquea doble clic, conserva selecciones, descarta lecturas al cerrar y recarga después de mutar. Antes de enviar lee la primera página reciente para distinguir nuevos mensajes de registros antiguos ante respuesta perdida; nunca reenvía automáticamente.

**Sin SQL nuevo:** consulta remota de solo lectura confirmó RLS y SELECT/INSERT servidor de notificacion, acceso directo anon/authenticated bloqueado y mapa activo con edificios/pisos. Sin nuevas tablas, columnas, colecciones, índices, dependencias ni escrituras remotas del agente.

Validación local:345/345 pruebas backend (77 físicas), TypeScript/build, export web/Android/iOS y QA Edge390×844/1280×900 como propietario/receptor. Cubre términos originales, doble confirmación/cancelación, acceso tras retiro, ubicación/privacidad, Mongo ausente/fallido, cierre/suspensión durante lookup, rollback/COMMIT incierto, reintento desde página antigua y regresión de solicitudes/fotos/contenido/retirada/resolución. QA real de aplicación permanece para cierre de fase según acuerdo usuario.

## Historial propio de recursos físicos (F2.4-09)

Marketplace ofrece Mis publicaciones, Solicitudes recibidas, Mis solicitudes y Mis transacciones. Conserva publicaciones de cualquier estado, incluidas retiradas, solicitudes rechazadas/canceladas y acuerdos completados/cancelados. Cada registro permite consultar su detalle y campus original, incluso después de cambiar el campus del perfil.

Rutas autenticadas bajo `/api/v1/marketplace/physicalgoods`:

- `GET /my-publications?page=1&limit=10`: publicaciones cuyo propietario es el usuario vigente. Incluye estado, `isWithdrawn`, campus/categoría/condición/modalidad/precio, `publishedAt` y `canView` (acceso al recurso operacional).
- `GET /:publicationId/history`: detalle exclusivo del propietario con descripción e imágenes firmadas durante60 segundos. Valida rutas Storage contra el campus original. Solo retorna imágenes actualmente conservadas; no reconstruye versiones de auditoría.
- `GET /received-requests` y `/sent-requests`: listas existentes ampliadas al historial completo propio; agregan campus, propietario, `publication.isWithdrawn` y `canResolve`. Conservan orden/paginación y contratos previos. La solicitud pendiente de otra persona nunca recibe el acuerdo elegido.
- `GET /:publicationId/requests/:requestId`: detalle propio para propietario o solicitante, con mensaje, estado/fecha, publicación/campus y su acuerdo si existe. Comprueba simultáneamente publicación, solicitud e identidad.
- `GET /transactions?page=1&limit=10`: acuerdos del usuario como propietario/receptor, con estado, campus, publicación, rol, términos originales y fecha de inicio. Sin filtros de disponibilidad ni campus vigente.
- El detalle de acuerdo y `GET /:publicationId/transactions/:transactionId/messages` existentes permiten leer historia propia de otros campus. `canConfirm`/`canCancel` son falsos fuera del campus actual; confirmar/cancelar/enviar mensajes y los endpoints públicos conservan sus validaciones operacionales.

Listas aceptan únicamente `page`/`limit` y mantienen `{data,meta}`. Los detalles usan `{data}`. Todas las lecturas comprueban cuenta/capacidad y contexto persistidos en servidor; los repositorios filtran propiedad/participación. No hay excepción de lectura para administradores ajenos. No se aceptan IDs de usuario/campus como alcance del cliente. 400 entrada;401 sesión;403 cuenta/capacidad;404 ajeno;409 contexto cambiado;503 dependencia sanitizada; no-store.

Frontend mantiene API→hooks→componentes, aborta lecturas al cerrar/cambiar de vista y ofrece actualizar/reintentar. Los detalles históricos son de consulta; cuando `canView` lo permite enlazan al recurso actual para sus acciones existentes. La búsqueda pública conserva DISPONIBLE/campus vigente. No se trasladan publicaciones ni se escriben registros por consultar historia.

Sin SQL que ejecutar, tablas/columnas/índices/dependencias/env nuevos. Validación:352/352 pruebas backend con Node22.23.3 (84 físicas,7 nuevas), TypeScript/build, exportaciones web/Android/iOS --no-bytecode y QA Edge390×844/1280×900 con API simulada. Incluye privacidad, campus anterior, todos los estados, esquema intacto, paginación, detalle/error/reintento/cierre tardío y regresiones de publicación/fotos/solicitudes/resolución/acuerdos. QA con datos reales y dispositivos permanece para el cierre de fase.

## Recordar el cierre de una publicación física (F2.4-10)

Decisión confirmada por el usuario el2026-10-15: **un único recordatorio al cumplir siete días desde `publicado_en`**. Reservar, aceptar solicitudes o actualizar contenido no reinicia el plazo. La propuesta temporal del backlog/Issue73 queda resuelta con esa aprobación, registrada en el contexto de GH-73.

El servidor inicia un worker de publicaciones físicas después del arranque válido de la API. Comprueba hasta100 pendientes por tanda, al iniciar y cada60 segundos después de terminar la anterior; no se solapa consigo mismo y espera la ejecución en curso al cerrar. Si la API estuvo detenida, la siguiente comprobación recupera publicaciones vencidas sin crear avisos semanales acumulados. Fallos de esta tarea no detienen el worker de actividades.

Solo son elegibles físicas `DISPONIBLE`/`RESERVADO`, no retiradas, con propietario activo y acceso general vigente. Excluye `FINALIZADO`, `OCULTO`, `CANCELADO`, digitales y eliminación lógica. La fecha límite y el texto se deciden en reminders.service; reminders.repository ejecuta SQL parametrizado. Por cada publicación se revalidan perfil/roles y publicación, con el orden de locks existente perfil→publicación/subtipo. Una sentencia posterior al lock vuelve a consultar la existencia del aviso antes de insertarlo, de modo que ejecuciones concurrentes no dupliquen una entrega ya confirmada.

Reutiliza exclusivamente `notificacion.destinatario_id/publicacion_id/tipo_notificacion/titulo/mensaje/created_at` originales. Tipo `PHYSICAL_PUBLICATION_CLOSE_REMINDER`, título de la publicación y fecha de generación de PostgreSQL. La comprobación de duplicados considera también avisos leídos/eliminados: borrar la notificación no reinicia el recordatorio. No modifica publicación, `updated_at`, solicitudes, acuerdos ni auditoría. Una entrega fallida revierte y se reintenta; si el COMMIT ocurrió pero se perdió el acuse, la siguiente lectura detecta el aviso existente.

La bandeja existente `/api/v1/users/me/notifications` conserva sus rutas, paginación cursorada, lectura, eliminación y no-store. Sus `items` admiten el DTO físico `{id,publicationId,type:'PHYSICAL_PUBLICATION_CLOSE_REMINDER',title,message,createdAt,readAt}` junto a los DTO de actividades existentes. Se verifica destinatario y propiedad física persistidos, sin excepción administrativa. Avisos propios de publicaciones de un campus anterior siguen consultables con su historial (F2.4-09); las actividades mantienen su campus vigente y los mensajes `COORDINACION_RECURSO` permanecen fuera de la bandeja.

«Revisar publicación» marca lectura tras acuse y abre el detalle propio actual de F2.4-09. Este detalle añade `activeTransaction:{id,status}|null`, consultado en ese momento, para abrir el acuerdo pendiente de F2.4-08. El vínculo operacional existente permite editar/retirar con autorización habitual. `/physicalgoods?publicationId=<uuid>` abre el recurso específico; IDs inválidos no se incorporan al API. Otro campus/retirada conserva solo las acciones que el servidor autoriza. Abrir un aviso no confirma ni retira automáticamente. La bandeja cancela lecturas al perder foco para que una respuesta tardía no abra un modal en otra pantalla.

**Sin SQL nuevo ni dependencias:** usa tablas, atributos, permisos y migraciones existentes, incluidas las columnas de actividades ya utilizadas por la bandeja. No se reutiliza `actividad_evento_clave` como clave física ni se agrega un atributo de último recordatorio. Requiere el backend en ejecución; entrega dentro de la aplicación mediante su bandeja existente.

Validación local:363/363 pruebas backend con Node22.23.3 (95 físicas,11 nuevas), TypeScript/build backend y TypeScript frontend. Export web/Android/iOS --no-bytecode y QA Edge390×844/1280×900 con API ficticia: bandeja mixta/error/reintento/lectura/eliminación, confirmación explícita, retirada y reapertura del mismo recurso, campus anterior,404 limpio y respuesta tardía cancelada; regresiones de actividades/perfil, historial propio y publicación/fotos/edición/retirada aprobadas. SQL real con PGlite; QA real de datos/dispositivos y contención remota multiconexión permanece para el cierre de fase.

## Valorar al propietario de una transacción física (F2.4-11)

El comprador/receptor puede elegir una puntuación entera de1 a5 desde «Ver acuerdo» cuando ambas partes han completado el intercambio. La interfaz exige selección y confirmación explícita, muestra puntuación/fecha guardadas y no permite editar después. Venta y donación comparten el mismo flujo. El propietario puede consultar la valoración recibida, pero no valorar al receptor.

- `POST /api/v1/marketplace/physicalgoods/:publicationId/transactions/:transactionId/rating`: cuerpo exacto `{score:number}`,201 `{data:{id,score,createdAt}}`. Solo receptor del acuerdo físico COMPLETADA, cuenta/capacidad vigentes y campus actual del recurso. Evaluador, evaluado, transacción y fecha se determinan en servidor. Rechaza comentario, identidades, fechas y campos adicionales.
- El `GET` existente del acuerdo añade `rating:{id,score,createdAt}|null` y `canRate:boolean`. Solo los participantes pueden consultar el recibo; conserva la lectura histórica propia de F2.4-09, también de publicaciones retiradas/ocultas o campus anteriores. Fuera del campus vigente `canRate` es falso y no se habilitan escrituras históricas.
- 400 entrada/puntuación;401 sesión;403 cuenta/capacidad/propietario;404 acuerdo ajeno, digital o fuera del campus operacional;409 estado, duplicado o contexto cambiado;503 dependencia sanitizada. No-store y ausencia de rutas PUT/PATCH/DELETE para valoraciones.

Servicio reutiliza el contexto transaccional y orden de locks perfil→publicación/subtipo→transacción. Revalida participación, COMPLETADA y ausencia de valoración antes del INSERT parametrizado en `valoracion`; su UNIQUE original por transacción conserva la unicidad. No cambia publicación, términos, confirmaciones, solicitudes ni auditoría. Si se pierde el acuse de COMMIT, la consulta del acuerdo recupera el recibo sin reenviar automáticamente. Frontend conserva selección ante fallo, bloquea doble envío y aborta operaciones al desmontar.

**Sin SQL pendiente ni cambios de esquema:** usa exclusivamente la tabla y columnas originales de `valoracion`, con `comentario` nulo y fecha/id por defecto. Consulta Supabase READ ONLY del2026-10-15 confirmó RLS activo, SELECT/INSERT servidor y ausencia de acceso directo de anon/authenticated. El rol servidor conserva sus permisos administrativos preexistentes; la inmutabilidad funcional se aplica en la API. Sin nuevas tablas, atributos, índices, dependencias ni variables de entorno; sin valoraciones ni escrituras remotas de prueba.

Validación local:372/372 pruebas backend con Node22.23.3 (104 físicas,9 nuevas), TypeScript/build backend y TypeScript frontend. Export web/Android/iOS --no-bytecode y QA Edge390×844/1280×900 como receptor/propietario: estados y permisos, selección/confirmación, duplicados, venta/donación, respuesta perdida, conflicto entre sesiones, campus anterior, recibo inmutable y cierre tardío; regresiones de transacciones, historial y recordatorios aprobadas. PGlite ejecuta SQL con una conexión serializada; contención remota multiconexión y QA con datos/dispositivos reales quedan para el cierre de fase.

## Denunciar mal uso del marketplace físico (F2.4-12)

«Denunciar publicación» está disponible desde el detalle físico del campus actual; «Denunciar transacción» desde un acuerdo propio, en curso, completado o cancelado. Ambos participantes pueden denunciar el acuerdo aunque la publicación haya sido retirada u ocultada. Historial de otro campus conserva su lectura, sin habilitar esta nueva escritura. Usa el mismo formulario, validación y registro de `reports` que las actividades.

- `POST /api/v1/reports/physicalgoods/:publicationId` registra `PUBLICACION_FISICA` con el UUID del contenido. Exige acceso al detalle vigente: FISICO, campus actual, sin retirada y estado DISPONIBLE/RESERVADO/FINALIZADO.
- `POST /api/v1/reports/physicalgoods/:publicationId/transactions/:transactionId` registra `TRANSACCION` con el UUID del acuerdo. Exige publicación física del campus actual, relación exacta entre ambos IDs y participación como propietario o receptor; no excepción para administrador ajeno.
- Ambos aceptan únicamente `{reason:string,description?:string}`: motivo libre obligatorio de1..200 caracteres y descripción opcional hasta2000, con espacios exteriores normalizados. Sin query parameters. Identidad, campus, tipo/ID, copia del contenido, estado y fecha se resuelven en servidor.
- Devuelven201 `{data:{id,campusId,publicationId,transactionId:null|string,status:'PENDIENTE',reportedAt}}`, no-store. No devuelven motivo, denunciante ni contexto administrativo. 400 entrada;401 sesión;403 cuenta/capacidad;404 elemento inaccesible/ajeno;409 contexto cambiado;503 dependencia sanitizada.

Servicio físico de reports revalida perfil/roles/campus y bloquea perfil→publicación/subtipo→transacción como las operaciones existentes. Conserva en `contenido_reportado_json` una instantánea de contenido/metadatos de imágenes sin bytes/rutas Storage; para acuerdos añade participantes, términos originales, estado, fechas y confirmaciones. La copia no cambia si el contenido se edita u oculta después. No consulta Mongo/Storage al enviar, ni modifica publicación, solicitudes, transacción, valoración o auditoría. Denuncias de actividades reutilizan el mismo INSERT sin cambiar su contrato ni autorización.

Frontend mantiene reports/api→useContentReport→ContentReportForm dentro de los detalles existentes. La extracción sustituye el formulario/hook exclusivos de actividades, sin archivos puente, stores o pantallas nuevas. Conserva texto al fallar, bloquea doble envío/cierre durante envío y descarta respuestas al cambiar identidad/elemento o desmontar. Un acuse perdido no provoca reenvío automático; la UI informa que puede haberse guardado y que reenviar puede crear otra denuncia, como el flujo previo de actividades. No se introduce una regla de deduplicación no definida por el backlog.

La denuncia queda para moderación F2.8-02/03; este ticket no añade lectura/listado/resolución pública de casos ni denuncias de valoraciones. Motivo/denunciante/contexto siguen privados al registro administrativo. El Issue75 conserva una referencia antigua a MOD-04; el backlog vigente F2.4-12/F2.8-01 define motivo/descripción/PENDIENTE y no incluye esa espera. La diferencia se documenta en GH-75 sin inventar catálogo o medidas administrativas.

**Sin SQL pendiente ni cambios de esquema/dependencias:** reutiliza exclusivamente `reporte_contenido` y columnas originales, incluyendo su JSON/estados/defaults. Inspección Supabase READ ONLY del2026-10-15 confirmó RLS, SELECT/INSERT servidor y ausencia de acceso directo anon/authenticated. Sin tablas, atributos, índices, migraciones, env nuevos ni denuncias remotas de prueba.

Validación local:381/381 tests backend con Node22.23.3 (113 físicos,9 nuevos), TypeScript/build backend, TypeScript frontend y export web/Android/iOS --no-bytecode. QA Edge390×844/1280×900 como propietario/receptor: publicación/acuerdos en todos sus estados, motivo/descripción, doble clic, error/reintento, recibo,404, respuesta incierta/recibo incorrecto, campus anterior, respuesta tardía descartada y regresión del envío de actividades desde notificaciones. Regresiones de fotografías/contenido/retirada, transacciones/coordinación, valoraciones, historial y recordatorios aprobadas. QA con datos/dispositivos reales y contención remota multiconexión quedan para cierre de fase.

## Publicación digital (F2.5-01)

Biblioteca Digital utiliza las tablas existentes y el bucket privado `digital-resources` (25 MiB). No se crean tablas, columnas ni buckets. El servidor comprueba la configuración del bucket antes de cargar. La creación requiere un PDF válido; F2.5-02 amplía la gestión a varios PDF. La política ajustada en QA manual permite enlaces HTTPS, correo (`mailto:`) y teléfono (`tel:`); excluye HTTP y otros esquemas, cifrado, JavaScript, acciones automáticas/encadenadas/no admitidas y adjuntos internos. Los atributos de estructura/formato/accesibilidad se inspeccionan en su contexto, sin tratar toda clave `/A` como acción. Los bytes originales se conservan y los rechazos explican el motivo concreto (tamaño, formato/estructura, cifrado, scripts, adjuntos o enlace/acción no admitidos).

- `POST /api/v1/marketplace/elibrary`: Bearer y multipart con un campo `metadata` (JSON exacto `{title,description,modality,price,careerIds?,subjectIds?}`) y un archivo `file`. Título 1..200, descripción 1..4000; VENTA requiere precio numérico positivo, DONACION acepta precio ausente/null. Asociaciones según F2.5-03. Responde 201 `{data:publicación}`.
- `GET /api/v1/marketplace/elibrary`: últimas 30 publicaciones disponibles de la institución. `GET /:publicationId`: detalle por UUID. Ambos requieren sesión/cuenta habilitada y relación persistida perfil→campus→institución. Otros campus de la misma institución pueden consultar; otra institución recibe lista sin esos recursos/404 en detalle.
- DTO: datos de publicación, propietario, campus de origen/institución derivados del servidor y `files:[{id,name,mimeType,sizeBytes}]`. Incluye `careerIds`, `subjectIds`, `careers`/`subjects:[{id,name,code}]` y `updatedAt` UTC con seis decimales. Nunca retorna bucket, path ni URL del original. La descarga protegida se describe en F2.5-02; adquisición, preview y filtros avanzados siguen pendientes.
- Errores compartidos: 400 validación, 401 sesión, 403 cuenta/capacidad/campus, 404 publicación inaccesible, 409 contexto cambiado, 413 tamaño, 503 dependencia; respuestas no-store.

La transacción registra publicación DIGITAL/DISPONIBLE, subtipo y referencia RECURSO después de cargar los bytes. Se revalida perfil/roles bajo bloqueo. Un fallo revierte SQL y compensa Storage; una barrera advisory por UUID espera la resolución de COMMIT antes de comprobar referencias. Un COMMIT confirmado por referencia devuelve éxito; si no puede comprobarse o falla la limpieza, conserva el archivo y registra solo el UUID para reconciliación operativa (consultar referencia por publicación antes de eliminar). No hay transacción distribuida ni limpieza automática de archivos con estado desconocido.

`src/database/supabase/migrations/f2_5_01_publicacion_digital.sql` es repetible: protege `recurso_digital` y agrega una policy restrictiva de Storage que deniega originales a anon/authenticated incluso ante policies permisivas futuras. Conserva permisos físicos y requiere la frontera compartida de F2.4-01. Aplicada por el usuario y verificada en remoto el2026-10-20, con QA integrado aprobado.

Validación de PDF utiliza `pdf-lib`; transporte multipart acotado usa `busboy`; Expo incorpora `expo-document-picker` compatible con SDK57. Documentación de los contratos de librerías: [multipart y límites](https://github.com/mscdex/busboy), [opciones de carga PDF](https://pdf-lib.js.org/docs/api/interfaces/loadoptions), [selector Expo](https://docs.expo.dev/versions/latest/sdk/document-picker/). Esta validación no sustituye un análisis antivirus. Los originales permanecen privados.

## Adjuntos digitales y descarga privada (F2.5-02)

- `POST /api/v1/marketplace/elibrary/:publicationId/files`: Bearer y multipart con un único campo binario `file`, sin metadata/query. Devuelve201 `{data:{id,name,mimeType,sizeBytes}}`. Solo propietario vigente, recurso DIGITAL/DISPONIBLE no retirado y misma institución; sin excepción administrativa. El campus de origen se conserva aunque el propietario cambie a otra sede institucional.
- Cada petición transporta un PDF <=25MiB; la aplicación permite seleccionar varios, quitar archivos del borrador, publicar el primero y adjuntar los restantes en cola. Se pueden agregar más desde el detalle propio. Si una carga falla, se conservan los archivos registrados y los pendientes se pueden reintentar sin crear otra publicación. No hay límite arbitrario de cantidad: se respeta el rango de orden smallint del esquema.
- Un mismo contenido solo se puede adjuntar una vez por publicación, incluso con otro nombre. El cliente omite copias repetidas en la selección; el servidor compara SHA-256 con originales registrados del mismo tamaño y publicación (incluidos los anteriores a este cambio). Las lecturas de Storage ocurren fuera de locks SQL y el snapshot se revalida bajo la barrera existente antes del INSERT, evitando duplicados concurrentes y compensando únicamente el nuevo objeto descartado. Un duplicado devuelve409/CONFLICT con mensaje explícito; no se expone el hash ni se impide reutilizar el archivo en otra publicación. No requiere migración ni elimina duplicados históricos automáticamente.
- Upload privado sin sobrescritura antes de abrir la transacción; revalida cuenta/propiedad/institución/estado, bloquea publicación y asigna orden siguiente de forma serializada. INSERT de referencia y actualización de fecha son atómicos. Fallos compensan solo el archivo nuevo; barrera de reconciliación protege archivos referenciados tras COMMIT incierto. Ante resultado de red desconocido, revisar los adjuntos antes de reintentar manualmente; no hay reenvíos automáticos.
- `GET /api/v1/marketplace/elibrary/:publicationId/files/:fileId/download`: verifica identidad vigente y misma institución; exige propietario o derecho persistido en acceso_recurso_digital vinculado a transacción COMPLETADA del mismo recurso/receptor/propietario y confirmaciones de ambas partes. No crea transacciones ni derechos. Los derechos legítimos se conservan ante desactivación del propietario/publicación; el receptor debe seguir habilitado.
- La API descarga desde Storage y vuelve a comprobar cuenta/derecho antes de devolver bytes como attachment, application/octet-stream, no-store y nosniff. Nunca entrega URLs firmadas/públicas ni paths; valida relación archivo/publicación, bucket, ruta y tamaño registrado. La interfaz propia permite descargar en web o guardar/compartir mediante expo-sharing en nativo; las pantallas de materiales adquiridos corresponden a F2.5-08.

**Sin SQL pendiente para F2.5-02:** la inspección remota confirmó tablas, RLS y SELECT/INSERT/UPDATE servidor necesarios; se reutiliza la política instalada de F2.5-01. No nuevas tablas/columnas/buckets ni cambios a F2.4. PDF confirmado como formato de esta entrega; otros formatos y las decisiones de edición/conservación futuras siguen fuera del alcance. No eliminación ni reemplazo de archivos existentes.

## Asociaciones académicas digitales (F2.5-03)

- `GET /api/v1/marketplace/elibrary/academic-options`: autenticado, sin query. Carreras activas de la institución derivada del perfil vigente; asignaturas activas vinculadas a esas carreras, sin limitar al campus ni a las carreras del usuario. Cada asignatura aparece una vez, con `careerIds` del catálogo que comparten ese UUID.
- La creación permite arrays UUID `careerIds`/`subjectIds`, sin duplicados ni campos privilegiados. Omitidos normalizan a vacíos; `null` es inválido. Las selecciones son directas e independientes: una asignatura no exige seleccionar todas o alguna de sus carreras. Se comprueba pertenencia al catálogo institucional antes de Storage y de nuevo en la transacción de publicación. No se crean carreras/asignaturas desde el formulario.
- `PATCH /api/v1/marketplace/elibrary/:publicationId/academics`: JSON exacto `{careerIds,subjectIds,updatedAt}`, ambos arrays obligatorios (vacíos permiten quitar asociaciones). Solo propietario habilitado y recurso DIGITAL/DISPONIBLE no retirado de su institución. Revalida identidad/contexto, versión y catálogo bajo locks; no concede una excepción administrativa. Cambios concurrentes, incluidos adjuntos, producen409. Conjuntos idénticos no escriben ni generan historial.
- Reutiliza `publicacion_carrera` y `publicacion_asignatura`, con PK compuestas; asignaturas compartidas mantienen su UUID original. La lectura devuelve asociaciones vigentes y nombres/códigos incluso si posteriormente se desactiva el catálogo; una edición debe retirar las selecciones que ya no son válidas.
- Snapshots anteriores/posteriores en `auditoria` se guardan atómicamente con la edición, con IDs/nombres/códigos y términos de publicación; la lectura administrativa existente los filtra. No modifica solicitudes, condiciones de transacciones, derechos ni archivos. Un fallo SQL/auditoría revierte el conjunto; ante COMMIT incierto responde503 y exige recargar antes de reintentar.
- Sin tablas/columnas/dependencias ni migración nueva. Permisos/RLS y acciones de auditoría ya instalados fueron comprobados en Supabase. El catálogo operativo debe ser provisto por la institución; no se inventan asignaturas. Filtros/recomendaciones y edición general permanecen en F2.5-04/10/09.

## Búsqueda digital (F2.5-04)

`GET /api/v1/marketplace/elibrary` admite únicamente `q` (hasta200 caracteres), `careerId`, `subjectId`, `modality` (VENTA/DONACION), `page` y `limit` (1..100, defecto20). Devuelve `{data:[publicación],meta:{page,limit,hasMore}}`; detalle conserva contrato anterior. Filtra título/descripción como texto literal (comodines escapados), asociaciones múltiples con EXISTS, disponibilidad/archivo válido y siempre institución derivada del servidor. No entrega contenido de archivos. Expo ofrece filtros, paginación y estado sin coincidencias.

## Vista previa digital (F2.5-05)

`GET /api/v1/marketplace/elibrary/:publicationId/files/:fileId/preview` requiere sesión/cuenta habilitada y publicación disponible de la misma institución. Sin query ni página/offset cliente. Devuelve JSON `{available,text,page,message}`: hasta400 caracteres y como máximo mitad de hasta800 caracteres extraídos de la primera página. PDF corto/escaneado/sin texto: sin muestra, conserva metadatos. Nunca devuelve PDF, enlaces ni rutas. Revalida identidad/recurso tras Storage/extracción. Descarga completa mantiene autorización separada.

Mozilla `pdfjs-dist`6.4.299 se ejecuta en worker sin variables de entorno, evaluación ni descarga de fuentes; máximo2 concurrentes, heap128MB y8s. Workers, timers y slots se liberan en finally. Node requerido>=22.13 <23; manifest/lock coinciden. Sin SQL ni archivos PREVIEW persistidos nuevos.

## Solicitudes y adquisición digital (F2.5-06)

Bearer en todas las rutas. `GET /elibrary/:id/request-options` informa elegibilidad/derecho existente y mensajes activos del catálogo; `POST /:id/requests` recibe `{messageCode}`. `GET /requests/sent|received` pagina únicamente solicitudes propias institucionales, incluso tras retirada. `PATCH /:id/requests/:requestId` recibe `{decision:"ACEPTAR"|"RECHAZAR"}` y solo dueño habilitado resuelve. Aceptar crea acuerdo con modalidad/importe/moneda originales sin reservar ni agotar el digital.

`GET /:id/transactions/:transactionId` es privado de los dos participantes. `POST /confirm|cancel` recibe `{}` exacto. Doble confirmación/completado/derecho se guardan atómicamente; una confirmación no habilita descarga. Cancelar registra actor/fecha/motivo USUARIO_DESISTE y cancela solo su solicitud, sin derecho. Operaciones terminales repetidas son idempotentes; red/COMMIT desconocido requiere reconsultar, sin reenvíos automáticos. Sin pagos ni conversación libre. Perfiles se bloquean ordenados antes de barrera/publicación/acuerdo; se revalidan ambos participantes institucionales antes de aceptar/completar. Sin SQL nuevo: se comprobaron índices/RLS/grants remotos existentes.

## Materiales digitales adquiridos (F2.5-07/08)

DTO de búsqueda/detalle añade `acquired` calculado solo para la identidad servidor; cerrar/cancelar un acuerdo no cambia otros ni consume el digital. `GET /elibrary/acquired` (page/limit) y `GET /acquired/:publicationId` consultan únicamente derechos válidos propios con el mismo predicado de la descarga. Respetan institución actual, aunque recurso/propietario estén desactivados; incorporan `isWithdrawn` y `acquisition:{transactionId,acquiredAt,modality,amount,currency}` con términos originales. Expo ofrece sección paginada y descarga autenticada en web/nativo. Sin permiso por usuario/receptor en query ni URLs privadas.

## Editor y retirada digital (F2.5-09)

`GET /elibrary/mine` pagina publicaciones del dueño, incluidas retiradas; `GET /mine/:id` devuelve detalle propio. `PATCH /:id` admite exactamente `{title,description,modality,price,updatedAt}` y `DELETE /:id` solo `{updatedAt}`; no-store y dueño vigente. Versión de seis decimales bajo locks evita perder edición/adjuntos/asociaciones concurrentes; no-op no escribe. Retirada usa deleted_at y auditoría atómica, conserva solicitudes/acuerdos/derechos/bytes y excluye descubrimiento/nuevas solicitudes. Respuestas inciertas exigen recarga. Los originales no se reemplazan ni borran; política confirmada por el usuario: archivo diferente requiere otra publicación.

## Recomendaciones digitales (F2.5-10)

`GET /elibrary/recommendations` admite page/limit y devuelve publicaciones institucionales activas con `{recommendation:{score,reasons}}`; excluye propios/adquiridos mediante el predicado de derecho de descarga. Pesos revisables en DIGITAL_RECOMMENDATION_WEIGHTS:30 por carrera,20 por asignatura relacionada (máximo3 cada una),5 por vista propia,10 por solicitud propia activa y1 por actividad agregada (máximo5). Desempata por fecha/id; nuevos usan perfil y sin perfil actividad/recientes. No ML ni proveedores externos; explicaciones no revelan identidades ni conversaciones. Vistas explícitas de F2.7-01 alimentan la misma tabla de señales, sin registrar otra vista al consultar metadatos. Orden/paginación SQL y proyección en bloque, no N+1.

## Registro de eventos para analítica (F2.7-01)

Sin cambios de esquema ni migraciones. La API valida los datos y utiliza las tablas existentes. Las vistas se insertan en `interaccion_recurso`; cada fila de `solicitud_recurso` representa una solicitud. Reservas y transiciones proceden de `transaccion_recurso` y sus confirmaciones, guardadas en la misma transacción de negocio. `readResourceAnalyticsEvents` normaliza esos hechos en tipos VISTA, SOLICITUD_CREADA y TRANSACCION_RESERVADA/PENDIENTE_CONFIRMACION/COMPLETADA/CANCELADA, con claves estables, actor, recurso, campus de origen y fechas de seis decimales en UTC. Filtra por campus y rango `[from,until)` sin excluir contenido o cuentas por su estado o baja actual. El campus proviene de la publicación conservada; los cambios de campus del actor no trasladan la historia.

`POST /api/v1/analytics/resources/:publicationId/views` exige Bearer y cuerpo exacto `{operationId:UUIDv4}`. No admite campus, usuario, fecha, tipo ni query. Revalida cuenta/roles/campus en transacción y comprueba visibilidad del recurso: física en campus propio; digital en la misma institución según acceso vigente de biblioteca. Devuelve `{publicationId,campusId,type:'VISTA',recorded:true}`. La API deriva un UUID estable para la PK existente usando actor/operación; repetirla conserva la fecha original, reutilizarla en otro recurso devuelve409. Fechas y datos de identidad nunca proceden del body. Errores400/401/403/404/409/503 y respuestas no-store.

Expo registra una vista al abrir correctamente la ficha, sin señales por tarjetas, consultas GET, recargas o renovación de fotos. Reabrir genera una clave nueva. Una respuesta incierta se reintenta una vez con la misma clave; los fallos de telemetría no bloquean la ficha. Las vistas anteriores conservan su agrupación histórica de24h y no se inventan aperturas pasadas.

Las rutas existentes `POST /marketplace/physicalgoods/:id/requests` y `POST /marketplace/elibrary/:id/requests` aceptan `Idempotency-Key: UUIDv4`. El cliente debe conservarla ante resultados inciertos. La PK de la solicitud deriva de esa clave y del actor; un replay devuelve la solicitud original incluso si fue resuelta, sin crear otro evento. Reutilizarla con distinto recurso o mensaje devuelve409. La cabecera es opcional por compatibilidad; clientes anteriores sin clave conservan únicamente la protección contra solicitudes activas duplicadas. Los clientes Expo actualizados la envían y la conservan al reintentar. Las confirmaciones y los cierres conservan sus protecciones idempotentes previas; nuevas fechas usan `clock_timestamp()` para registrar el instante de escritura después de adquirir los locks.

Actividades reutilizan `activity_interactions` VIEWED/JOINED/LEFT y su cobertura LEGACY_STATE. Cuentas reutilizan la auditoría atómica anterior/nueva: `readAccountStateAnalyticsEvents` conserva cambios de estado aunque el perfil se desactive o cambie de sede. Las proyecciones de eventos son internas; los consumidores deben autorizar campus y período antes de invocarlas. F2.7-02 añade la consulta autenticada del tablero descrita a continuación. Sin eventos de búsqueda ni índices, tablas, columnas, funciones SQL o triggers nuevos.

## Tablero de cuatro KPI esenciales (F2.7-02)

`GET /api/v1/analytics/dashboard?from=2026-10-01&to=2026-10-21&campusId=<uuid>` requiere Bearer y cuenta activa. Desde F2.7-04, `from` y `to` son fechas civiles válidas e inclusivas de `America/Santiago`; `campusId` es opcional y toma el campus vigente del perfil. El servicio exige `reports`: ADMINISTRADOR o USUARIO_AUTORIZADO con ACCEDER_REPORTERIA en cada sede consultada. ACCEDER_ANALITICA por sí solo no concede el tablero. Cada campus debe estar activo y pertenecer a la institución del perfil, aunque el usuario envíe otro UUID o tenga asignaciones inconsistentes. Filtros institucionales y agrupaciones se describen a continuación.

Respuesta `{data:{scope,period,generatedAt,activeUsers,resourceDemand,subjectDemand,activityParticipation,grouping,intervals,notes}}`. Cada KPI contiene `value`, `period` y `scope` (IDs/nombres de institución/campus). `period` incluye `from`, `to`, `timeZone:'America/Santiago'` y `cutoff` exclusivo expresado como instante ISO UTC: inicio del día siguiente en la zona institucional, limitado a `generatedAt` para el período en curso. Ambos motores consultan `[from,cutoff)`, sin truncar los microsegundos SQL. Un rango totalmente futuro tiene valores KPI `null`. 400 filtros/fechas/agrupación/rango inválidos;401 sesión;403 ámbito/permiso;503 dependencia consultada. Todas las respuestas son no-store; un fallo SQL o MongoDB no se convierte en cuatro ceros ni devuelve KPI parciales.

- `activeUsers`: cuentas creadas antes del corte y no eliminadas antes de él, con estado ACTIVA reconstruido usando estados antes/después de auditoría. Incluye perfiles hoy suspendidos/desactivados cuando eran activos al corte y perfiles sin evento de creación. No equivale a inicios de sesión. La pertenencia al campus es la del perfil al consultar: el esquema actual no tiene historial de cambios de campus.
- `resourceDemand`: `views` y `requests` separados, `value=views+requests`. Cuenta VISTA de interaccion_recurso y cada solicitud por solicitada_en, incluso cancelada/resuelta y con publicaciones/actores retirados. Un recurso sin asignatura sigue contando.
- `subjectDemand`: `subjects:[{subjectId,subjectName,views,requests}]`, totales separados y `value=views+requests` de esas asociaciones. Usa publicacion_asignatura vigente, incluso asignaturas deshabilitadas; cada hecho cuenta una vez por asignatura. Un recurso con varias asignaturas contribuye a cada una, por lo que este total no representa interacciones exclusivas.
- `activityParticipation`: JOINED históricos en activity_interactions (incluido creador/reinscripciones), sin restar LEFT ni consultar visibilidad actual de la actividad. `label:'Inscripciones registradas'` y `legacyEvents` explican la cobertura parcial importada. No representa asistencia presencial ni participantes actuales.

Las notas visibles explican cobertura parcial anterior, asociaciones actuales y estado auditado. La API no recupera vistas que antes se agruparon por24h ni transiciones nunca registradas. No se guarda ninguna instantánea ni se altera el esquema. Arquitectura: router → controller → analytics.service (validación/autorización/DTO) → analytics.repository (agregaciones SQL/MongoDB). Frontend separa pantalla, hook de carga cancelable, API y tipos; borra métricas ante cambios de identidad/alcance y refresca identidad ante401/403.

## Filtros institucionales de analítica (F2.7-03)

`GET /api/v1/analytics/options`, autenticado y sin query, devuelve `{data:{institutions:[{id,name,campuses:[{id,name}],careers:[{id,name,campusIds}]}]}}`. Solo incluye campus activos con capacidad `reports` vigente y pertenecientes a la institución del perfil. Las carreras corresponden a oferta o asociaciones directas de perfiles/publicaciones de esas sedes. Incluye relaciones académicas inactivas conservadas para analítica; no expone usuarios, publicaciones ni métricas. No concede acceso a otras instituciones por tener una asignación inconsistente.

`GET /api/v1/analytics/dashboard?institutionId=<uuid>&campusIds=<uuid>,<uuid>&careerId=<uuid>&from=2026-10-01&to=2026-10-21` selecciona una institución, uno o varios campus y carrera opcional. Se normalizan UUID y campus repetidos sin multiplicar conteos. `campusIds` es una cadena separada por comas, no parámetros repetidos/arrays. Se mantiene `campusId` para consumidores de una sola sede; no puede combinarse con `campusIds`. Institución omitida toma la del perfil; campus omitidos toman el del perfil. Carrera omitida significa ausencia de filtro (incluye registros sin clasificación). Institución/carrera inválidas, sedes ajenas o inactivas y permisos revocados reciben403 antes de leer MongoDB; sintaxis/campos extra reciben400. Fallos de cualquiera de los motores reciben503, sin KPI parciales.

El mismo ámbito llega a todos los KPI: cuentas por campus actual y `usuario_carrera`; demanda por campus de origen de la publicación y `publicacion_carrera`; demanda de asignaturas agrega `publicacion_asignatura` de esos mismos recursos; participación filtra campus del evento y carrera actual del participante por `userId`, sin exigir estado de cuenta activo actual. Las asociaciones de carrera/asignatura digitales son independientes: no se exige que la asignatura pertenezca a la carrera seleccionada ni que esa carrera se ofrezca en el campus de origen del recurso. Se usan `EXISTS` y agregados por publicación para evitar multiplicar eventos por carreras; el total sin filtro no suma subtotales de carreras. El estado de cuenta conserva la reconstrucción al corte ya documentada.

`scope` añade `campuses:[{id,name}]` y `career:{id,name}|null`; conserva `institutionId/institutionName` y `campusName` (nombres separados por coma). `campusId` conserva el UUID con una sede y pasa a null con varias. Cada tarjeta recibe el mismo scope, período y carrera. Las consultas dinámicas usan relaciones actuales, que pueden alterar métricas al editar una asociación; las cifras entre carreras no son exclusivas. Las instantáneas de F2.7-06 deberán preservar filtros y resultados sin recalcularlos; esta tarea no crea almacenamiento de reportes.

Expo consulta las opciones del servidor y ofrece institución, selección múltiple de sedes y carrera opcional, con rótulo del ámbito en cada tarjeta. Permite abrir Analítica con permiso en otra sede aunque la sede actual del perfil carezca de él. Cambios de identidad, permisos o filtros retiran datos anteriores inmediatamente y abortan/descartan respuestas tardías; seleccionar cero campus no consulta métricas. Consultar/reintentar renueva opciones y fechas. El cálculo sigue en servicio/repositorio; no se filtran cifras en el cliente. Sin tablas, funciones SQL, triggers, migraciones ni dependencias nuevas.

## Métricas por período (F2.7-04)

El mismo endpoint admite `grouping=week|month` (predeterminado `month`). Ejemplo: `/api/v1/analytics/dashboard?from=2026-09-01&to=2026-10-21&grouping=week&campusIds=<uuid>,<uuid>`. La zona institucional es `America/Santiago`, confirmada por el usuario para GH-99; no se acepta una zona arbitraria del cliente. Semanas de lunes a domingo, meses calendario y máximo 260 intervalos por consulta (400 si se excede). El inicio/final del rango recortan los intervalos extremos. La API convierte fechas civiles mediante Temporal, ya instalado, respetando días de 23/25 horas y medianoches inexistentes por horario de verano. Los eventos originales no se modifican.

`intervals` está ordenado y contiene `{key,label,period,status,coverage,metrics}`. `key` es la fecha civil de inicio de la semana/mes completo, incluso si se recorta. `period` identifica los días incluidos y el corte exclusivo efectivo. `metrics` contiene los cuatro KPI, con su ámbito/período y demanda por asignatura. La demanda y las inscripciones pueden sumarse entre intervalos contiguos del mismo reporte; los usuarios activos son saldos independientes al corte y **no se suman**. El total raíz usa la misma definición de cálculo y el último corte efectivo.

- `status:'recorded'`: hay vistas, solicitudes o inscripciones registradas.
- `status:'no_activity'`: cero vistas, solicitudes e inscripciones registradas. Puede haber cuentas activas al corte.
- `status:'unavailable'`, `coverage:'unavailable'`, `metrics:null`: intervalo futuro, sin observaciones disponibles; no equivale a cero.
- Para intervalos observables, `coverage:'partial'`: las fuentes históricas no tienen metadata que certifique captura completa. Cero registros no garantiza que toda actividad real haya sido capturada; la primera fila tampoco demuestra cuándo empezó la cobertura. Se conserva `legacyEvents` y la advertencia de vistas antiguas coalescidas. No se inventa una fecha de despliegue ni se introduce persistencia adicional. Para un rango enteramente futuro, los `value` raíz son `null`; los contadores auxiliares vacíos no deben interpretarse como observaciones.

Servicio valida fechas, agrupación, límites y permisos, genera un solo instante de corte y coordina repositorios; frontend solo presenta resultados. SQL obtiene todos los cortes de cuentas en una consulta y toda la demanda/asignaturas en otra usando rangos parametrizados, `date_trunc` con zona explícita y relaciones existentes sin multiplicar hechos por carreras. MongoDB realiza una agregación con `$facet` (total/períodos), `$dateTrunc` y `startOfWeek:'monday'`. Ambos reciben los mismos extremos; no hay consultas de red por intervalo. Se conservan bajas lógicas, estado auditado, filtros institucionales y permisos de cada sede.

Expo ofrece semana/mes, resumen y evolución por intervalo con fechas, ámbito, usuarios al corte, vistas/solicitudes separadas, asignaturas e inscripciones. La agrupación confirmada forma parte de la identidad de consulta: una respuesta mensual tardía no reemplaza una semanal. Fechas iniciales de pantalla también se calculan en `America/Santiago`.

La issue menciona ANA-10, cuya definición no existe en el backlog primario actual. La decisión del usuario en GH-99 fija explícitamente zona y semanas; no se afirma conformidad con un texto no disponible. No hay DDL, funciones SQL nuevas, triggers, tablas, migraciones, paquetes ni escrituras de analítica adicionales. Reportes persistidos siguen fuera de alcance (F2.7-06).

## Generación de reporte analítico (F2.7-05)

`POST /api/v1/analytics/reports` requiere Bearer y `Content-Type: application/json`. Recibe los mismos filtros que el tablero en un cuerpo JSON, sin query:

```json
{
  "institutionId": "<uuid>",
  "campusIds": "<uuid>,<uuid>",
  "careerId": "<uuid>",
  "from": "2026-09-01",
  "to": "2026-09-30",
  "grouping": "week"
}
```

`from/to` son obligatorios, civiles inclusivos en America/Santiago. `grouping` admite `week|month` (mes por defecto); semanas lunes-domingo, hasta 260 intervalos. Institución y campus omitidos usan el perfil vigente. `careerId` se omite para consultar sin filtro de carrera. `campusIds` conserva la cadena de UUID separados por coma del tablero; `campusId` sigue disponible como alternativa de una sede y no se combina con `campusIds`. El servicio normaliza y valida todos los filtros; no acepta cifras, fechas de generación ni responsables aportados por el cliente.

200 `{data: AnalyticalReport}`: mismo contrato completo de `DashboardData` (`scope`, `period`, `generatedAt`, `grouping`, cuatro KPI, `intervals`, `notes`), más `generatedBy:{userId,name}` obtenido de la identidad verificada y `calculationVersion:"campuslink-kpi-v1"`. Desde F2.7-06 añade `id` UUID de la instantánea guardada. Los nombres institucionales/campus/carrera proceden del repositorio. `generatedAt` es el instante de inicio del cálculo; es también el límite común de observación del período en curso. La versión identifica las definiciones actuales de F2.7-01..04; un cambio semántico futuro debe revisarla. Los indicadores, notas y metadatos de disponibilidad conservan su significado del tablero: cuentas activas al corte (no sumar saldos), vistas/solicitudes separadas, demanda por asignatura no exclusiva, inscripciones sin afirmar asistencia y asociaciones académicas actuales.

Router autenticado → controller de transporte → `generateAnalyticalReport` → `getDashboard` → repositorios existentes. Toda generación vuelve a verificar cuenta y asignaciones vigentes; se exige `reports` en **cada** campus y la institución/carrera deben ser válidas para ese ámbito. No reutiliza resultados recibidos del navegador. 400 por filtros/cuerpo/query inválidos, 401 por sesión, 403 por autorización/ámbito y 503 por fuente no disponible, sin cifras parciales; `Cache-Control:no-store` en todas las respuestas autenticadas. Mismos parámetros y hechos disponibles producen iguales cifras que el tablero; consultas separadas pueden observar nuevas escrituras, y SQL/Mongo no comparten instantánea distribuida.

En Expo, “Generar reporte” envía los filtros y fechas del formulario y presenta ámbito, carrera o ausencia de filtro, período, agrupación, fecha/hora institucional y responsable junto a las mismas tarjetas/evolución del tablero. Desde F2.7-06 confirma “Reporte analítico guardado”, muestra su identificador e indica generar uno nuevo para actualizar cifras. Durante carga/error se retiran las cifras anteriores; cambiar selección/identidad o salir cancela la solicitud y descarta respuestas tardías. “Consultar” vuelve al tablero. Sin tablas, funciones SQL, triggers, migraciones, paquetes ni variables de entorno adicionales.

## Instantánea histórica del reporte (F2.7-06)

Cada `POST /api/v1/analytics/reports` calcula mediante `getDashboard` y guarda **un registro nuevo** en la tabla `public.reporte` existente antes de responder con éxito. La API construye tanto metadatos como resultados: el cuerpo sigue aceptando exclusivamente filtros; no acepta `id`, fecha, responsable, versión ni JSON de resultados del cliente.

Arquitectura: router autenticado → controller HTTP → servicio (validación, autorización, cálculo y DTO) → repositorio (SQL parametrizado). Tras calcular PostgreSQL/Mongo, una transacción SQL corta relee y bloquea el perfil y las asignaciones del solicitante con los mecanismos existentes; comprueba de nuevo cuenta activa, contexto institucional/campus y reportería sobre **cada** sede incluida antes del INSERT. No mantiene bloqueos SQL durante la agregación Mongo. Revocación durante el cálculo impide guardar; cambio de campus/institución devuelve409. Error de inserción o commit devuelve503 sanitizado sin resultado exitoso; no hay escritura parcial dentro de la transacción ni sobrescritura de reportes anteriores.

- `snapshot_json`: DTO `AnalyticalReport` completo, incluido `id`, responsable/nombre, `scope` con institución/campus/carrera y sus nombres al generar, `period` con zona/corte, agrupación, fecha, cuatro KPI, desglose por asignatura, intervalos, disponibilidad, notas y versión `campuslink-kpi-v1`.
- `filtros_json`: `{institutionId,campusIds:string[],careerId:string|null,from,to,grouping}` normalizados; sin duplicados de campus. Permite conservar todas las sedes aunque `campus_id` relacional sea null para reportes múltiples.
- Columnas existentes: responsable, institución, campus único o null, carrera opcional, `tipo_reporte=KPI_ESENCIALES`, `agrupacion=SEMANA|MES`, `generado_en=generatedAt`. `periodo_desde/periodo_hasta` representan el rango solicitado `[inicio,fin exclusivo)` en instantes UTC derivados de America/Santiago; el corte efectivo del período en curso y las fechas civiles inclusivas permanecen en el JSON. Los cambios DST se respetan.

`GET /api/v1/analytics/reports/:reportId` requiere Bearer, UUID válido y **ningún filtro/query**. Devuelve200 `{data:AnalyticalReport}` exactamente como se guardó. Consulta por PK/institución/tipo y verifica cuenta y reportería actuales sobre todos los campus conservados en `scope`; la autoría no sustituye el permiso. 400 por ID/query inválidos,401 sin sesión,403 por cuenta/permisos,404 por reporte inexistente o de otra institución,503 por dependencia no disponible. `Cache-Control:no-store`. No llama a `getDashboard`, no consulta hechos SQL/Mongo ni vuelve a obtener los nombres del responsable/catálogos: ediciones, cambios de carrera, nuevos hechos y bajas lógicas no modifican las cifras o metadatos originales. El ámbito histórico puede incluir catálogos hoy inactivos; solo se evalúan los permisos actuales del lector, sin reactivar contenido operacional.

El módulo no ofrece UPDATE, DELETE ni upsert de instantáneas. Para cifras actualizadas se genera otro reporte con nuevo UUID, fecha y resultado, preservando los anteriores. Consultas sucesivas durante la generación pueden observar escrituras nuevas: SQL y Mongo siguen sin una instantánea distribuida. La cancelación o pérdida de respuesta no revierte un commit del servidor; reenviar POST puede producir otro reporte. No se añade deduplicación no definida por el backlog.

Sin SQL pendiente: inspección Supabase READ ONLY confirmó las columnas existentes de `reporte`, RLS habilitado y ausencia de privilegios directos anon/authenticated. La API usa la conexión SQL de servidor existente. Sin DDL, índices, funciones SQL, triggers, migraciones, nuevas dependencias o escrituras remotas de prueba. Listado/filtros de historial y comparación visual corresponden a F2.7-07; exportación PDF/Excel a F2.7-08. Esas tareas deben consumir la instantánea y volver a autorizar cada campus.

Referencias: [PostgreSQL date_trunc y zonas](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-TRUNC), [MongoDB $dateTrunc](https://www.mongodb.com/docs/manual/reference/operator/aggregation/datetrunc/).

## Consulta de reportes históricos (F2.7-07)

`GET /api/v1/analytics/reports` requiere Bearer y devuelve200 `{data:{items:HistoricalReportSummary[],nextCursor:string|null}}`. Cada resumen conserva `id`, `generatedAt`, `generatedBy`, `scope`, `period`, `grouping` y `calculationVersion` de la instantánea original, sin cifras recalculadas ni nombres obtenidos de catálogos actuales. No se restringe al autor: cualquier lector actualmente autorizado en todos los campus del reporte puede consultarlo.

Filtros query opcionales:

- `institutionId`: UUID; por defecto institución actual. Otra institución devuelve403.
- `campusIds`: cadena de UUID separados por coma. Coincide con reportes que incluyan al menos uno de los campus seleccionados; el lector debe conservar permiso en **todos** los campus de cada reporte. Sin filtro, todos sus ámbitos autorizados. Un campus solicitado sin permiso devuelve403.
- `careerId`: UUID; coincide con la carrera guardada. Omitido incluye reportes con cualquier carrera o sin filtro de carrera.
- `from`, `to`: fechas civiles inclusivas `AAAA-MM-DD`, ambas opcionales; intersección con el período consultado guardado, **no** con la fecha de generación. Rango invertido/fecha inválida devuelve400.
- `grouping`: `week|month`; omitido incluye ambas.
- `limit`: entero1..50,20 por defecto. `cursor`: valor opaco `nextCursor` de la página anterior; omitir para volver al inicio. Fecha de generación e ID descendentes ofrecen orden estable incluso con empates o nuevas generaciones.

Ejemplo: `GET /api/v1/analytics/reports?campusIds=<uuid>&from=2026-09-01&to=2026-09-30&grouping=week`.

Cuenta, institución y capacidades vigentes se verifican en la API. La consulta parametrizada filtra el **ámbito completo** de cada instantánea antes de limitar la página, así que no filtra metadatos, tamaños ni cursores de reportes inaccesibles. No consulta publicaciones, carreras, perfiles del autor ni MongoDB; campus/carreras hoy inactivos conservan sus nombres y resultados históricos. Sin coincidencias responde200 con `items:[]` y `nextCursor:null`. 400 por parámetros desconocidos, repetidos o inválidos;401 sin sesión;403 por cuenta/alcance;503 sanitizado por dependencia. `Cache-Control:no-store`. No hay nuevas tablas, funciones SQL, triggers, índices, migraciones ni cambios de escritura.

Expo ofrece “Consultar reportes históricos” desde el tablero. El historial permite filtrar, paginar, abrir y comparar dos instantáneas, incluso de páginas diferentes, con sus parámetros, cuatro KPI, intervalos, notas, corte y versión de cálculo. Apertura, reapertura y comparación consultan `GET /reports/:reportId`, comprobando nuevamente los permisos; no invocan dashboard ni POST. La presentación `AnalyticsResults` es común al tablero, generación e historial. Errores no muestran cifras parciales; cambiar identidad/permisos, cerrar o reemplazar solicitudes retira resultados y descarta respuestas tardías. Los catálogos vigentes son ayuda opcional para seleccionar filtros; un catálogo sin sedes activas no impide consultar el historial. Exportación PDF/Excel permanece en F2.7-08.

## Exportar reportes guardados (F2.7-08)

`GET /api/v1/analytics/reports/:reportId/export/:format`, Bearer, sin query ni filtros nuevos. `reportId` debe ser el UUID de una instantánea existente y `format` debe ser `pdf` o `xlsx`. Responde200 con bytes y `Content-Disposition: attachment; filename="campuslink-reporte-<id>.<format>"`, `Cache-Control:no-store` y MIME `application/pdf` o `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. Errores JSON:400 ID/formato/query inválidos;401 sesión;403 cuenta/alcance;404 ausente u otra institución;503 dependencia/serialización o versión no soportada, sin detalles privados ni archivo parcial.

Se reutiliza `getAnalyticalReport` para leer exclusivamente el snapshot guardado y autorizar **todos** sus campus. Nunca consulta métricas operacionales, catálogos actuales ni genera otro reporte. El servicio prepara los bytes fuera de locks y luego relee perfil, roles y permisos con los mecanismos SQL existentes antes de entregarlos: una suspensión, cambio de contexto o revocación durante la preparación impide descargar. La autoría no concede acceso permanente. Ninguna escritura sobre el reporte ni objetos SQL nuevos.

`analytics.export.ts` presenta los valores almacenados sin sumar, normalizar ni recalcular resultados. Ambos formatos conservan ID, institución/campus/carrera (IDs y nombres originales), fechas civiles, zona/corte, agrupación, fecha original de generación con precisión ISO, responsable, versión y notas. Las definiciones están vinculadas a `campuslink-kpi-v1`; agregar una versión futura debe preservar el glosario histórico. Una versión desconocida no se interpreta usando reglas actuales.

- PDF: informe A4 con títulos, resumen, intervalos/asignaturas, definiciones y notas; ajuste de líneas y paginación sin truncar nombres. Fuente LiberationSans y licencia ya incluidas en pdfjs-dist, embebida con fontkit; los caracteres fuera de su repertorio se representan por su código `[U+...]` para no eliminarlos silenciosamente.
- Excel: XLSX real con hojas Reporte, Indicadores, Periodos, Asignaturas, Definiciones y Notas. Encabezados fijos y filtros; números en celdas numéricas y fechas civiles ISO ordenables. Asignaturas tiene filas independientes por intervalo/asignatura, además del resumen identificado `total`; no sumar resumen e intervalos. `unavailable` conserva celdas numéricas vacías, `no_activity` conserva ceros y el saldo guardado de usuarios activos. El texto permanece literal, sin fórmulas ni macros. La columna de eventos importados conserva el dato original de cobertura.

Expo muestra Exportar PDF/Excel en cada instantánea recién generada o abierta desde historial/comparación. El transporte binario usa la sesión actual y la API; el cliente no envía cifras ni crea archivos desde las tarjetas. `useReportExport` bloquea dobles clics, muestra progreso/error, permite reintentar y cancela respuestas tardías ante cambio de identidad/permisos/reporte o desmontaje. Web descarga un Blob temporal; móvil usa caché y expo-sharing y retira el archivo al terminar. `lib/files/saveFile` extrae el mecanismo existente de biblioteca digital, cuyo wrapper PDF mantiene el contrato anterior.

Dependencias nuevas con versión fija y lock: ExcelJS4.4.0 para escribir XLSX y @pdf-lib/fontkit1.1.1 para embeber la fuente. Se reutilizan pdf-lib, pdfjs-dist, autenticación, conexión PostgreSQL, expo-file-system y expo-sharing. Sin tablas, funciones SQL, triggers, migraciones, índices, configuración ni cambios de ingesta/persistencia. Validación local incluye HTTP/PostgreSQL embebido, lectura de XLSX/PDF reales, límites de página, revocación durante preparación, cancelación y guardado web/móvil simulado; aún requiere QA en dispositivo y entorno desplegado.

Referencias de serialización: [ExcelJS](https://github.com/exceljs/exceljs#readme) y [PDF-lib](https://pdf-lib.js.org/).

## Valoración digital (F2.5-11)

`POST /elibrary/:publicationId/transactions/:transactionId/rating` recibe `{score}` entero1..5, solo receptor del acuerdo COMPLETADA;201 recibo mínimo. Parser/elegibilidad son comunes con F2.4-11, cuyo contrato permanece igual. Lock del acuerdo y unique transaccion_id impiden simultáneas/duplicados; sin PATCH/DELETE ni valoración del dueño al receptor. Detalle privado añade rating/canRate para el formulario y resultado inmutable. La retirada del recurso no borra el respaldo.

## Denuncias digitales (F2.5-12)

`POST /api/v1/reports/elibrary/:publicationId` y `POST /elibrary/:publicationId/transactions/:transactionId` reutilizan reports con `{reason,description?}` y acuse privado. Recurso disponible institucional o acuerdo propio, incluso retirado; identidad, objetivo y campus de origen se derivan y comprueban en servidor. Conservan evidencia privada de metadatos y términos, nunca bytes, paths ni enlaces. Estado inicial PENDIENTE; no ocultan recursos ni cambian acuerdos/accesos. El formulario compartido distingue el campus de origen digital. La revisión y resolución administrativa corresponden a F2.8-02/03; enviar una denuncia no concede descarga. Sin SQL pendiente.

## Denuncias comunes de contenido (F2.8-01)

Los tres módulos usan `reports` y el mismo registro `reporte_contenido`. El formulario compartido se abre desde el detalle del contenido o del acuerdo propio. No se admiten valoraciones como objetivo ni denuncias de cuentas desvinculadas del contenido/intercambio.

Los recursos digitales accesibles también pueden denunciarse desde otro campus de la misma institución. La denuncia pertenece al campus de origen del recurso. Este alcance fue confirmado por el usuario el 2026-10-22 para resolver la diferencia entre F2.5-01 y F2.5-12; se conserva la autorización institucional existente.

| Método | Ruta bajo `/api/v1/reports` | Objetivo |
| --- | --- | --- |
| POST | `/activities/:activityId` | Actividad comunitaria o evento oficial accesible del campus vigente |
| POST | `/physicalgoods/:publicationId` | Publicación física accesible del campus vigente |
| POST | `/physicalgoods/:publicationId/transactions/:transactionId` | Acuerdo físico propio |
| POST | `/elibrary/:publicationId` | Publicación digital accesible |
| POST | `/elibrary/:publicationId/transactions/:transactionId` | Acuerdo digital propio |

Todos requieren Bearer, sin query, con JSON `{reason,description?}`: motivo obligatorio de 1–200 caracteres y descripción opcional de hasta 2000, normalizados en la API. Se rechazan campos adicionales y caracteres NUL antes de acceder a persistencia. Identidad, campus, relación, evidencia, estado y fecha se determinan en el servidor. El guardado de actividades reutiliza `lockAccountContext` para revalidar cuenta, institución, campus, verificación y roles persistidos dentro de la transacción, como los otros flujos; una concesión revocada no autoriza un envío iniciado previamente.

Respuesta 201 `no-store` con acuse mínimo (id, campusId, status PENDIENTE, reportedAt y actividad o publicación/transacción). No devuelve denunciante ni evidencia. Un fallo SQL o acuse de commit incierto devuelve 503 sin detalles internos; no se reintenta automáticamente. La evidencia conserva el contenido validado durante el envío. No se ocultan publicaciones/actividades, cambian acuerdos ni conceden archivos al denunciar. Revisión y resolución corresponden a F2.8-02/03. Sin nuevas tablas, funciones SQL, triggers, migraciones o dependencias.

## Trabajo posterior

Para preparar datos de QA entre módulos, consultar [Seeder general](qa/README.md).
Usa sedes y cuentas ficticias propias en las conexiones actuales; las credenciales
y el manifiesto permanecen en `qa/local/` ignorado por Git y Docker.

- Implementar flujos de negocio bajo sus tareas de backlog, con autorización explícita y campus vigente.
- Aplicar las comprobaciones compartidas de autorización al crear nuevos endpoints y mantener sincronizado el catálogo aprobado con el backlog.
- Reutilizar filtros y agrupaciones del tablero para F2.7-05/06; el health no demuestra cobertura analítica.
- Integrar moderación de actividades en reports cuando corresponda; su health inicial comprueba el registro relacional de denuncias.

## Referencias técnicas

[Inicialización Supabase JS](https://supabase.com/docs/reference/javascript/initializing), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [Auth en React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y [opciones de MongoDB Node](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/).
