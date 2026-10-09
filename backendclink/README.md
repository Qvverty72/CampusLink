# CampusLink Backend

Base API REST de F2.2-03 (GitHub #50). Node.js 22, TypeScript, Express 5, Supabase JS y driver oficial MongoDB. Las rutas se montan en /api/v1.

Inicio/cierre/recuperación de sesión F2.3-03: [contratos, permisos, plantilla y configuración de Supabase](docs/session-login-recovery.md).

Perfil académico F2.3-04: [API, validaciones, guardado transaccional y migración necesaria en Supabase](docs/academic-profile.md).

Roles y permisos por campus F2.3-05: administración mediante `/api/v1/users/access`, con alcance vigente, listado paginado y auditoría atómica. Requiere `SUPABASE_DB_URL`, administrador previamente incorporado y `src/database/supabase/migrations/f2_3_05_roles_permisos.sql`. [Guía local](docs/campus-role-permissions.md).

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
| SUPABASE_SECRET_KEY | Clave opcional exclusiva del servidor para diagnósticos y referencias de campus |
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

Completar .env localmente con MONGODB_URI, MONGODB_DB_NAME, SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY. Configurar SUPABASE_SECRET_KEY solo si las sondas/referencias necesitan la clave técnica del servidor. Obtener estos valores por el canal privado del equipo: no están en la imagen ni en el repositorio.

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
| analytics | Supabase: interaccion_recurso y reporte; MongoDB: activities y activity_participation |

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

GET /api/v1/maps/:campusId/active responde `200` con `{ data: <mapa> }`. Dentro de `data`, `buildings` permanece en la raíz del documento, el ObjectId se serializa como string y las fechas como ISO. Los errores utilizan el sobre común; un UUID inválido devuelve `400 VALIDATION_ERROR` con el campo afectado y un mapa/campus inexistente devuelve `404 NOT_FOUND`.

Ahora consulta primero public.campus por id y activo=true; solo después consulta el mapa ACTIVE. Un campus de Mongo sin referencia relacional válida no se entrega. Esta comprobación usa el cliente técnico y no constituye autorización del solicitante.

`frontendclink/src/three/api/mapApi.ts` desenvuelve `data` y expone errores con status, code y details para conservar el uso del documento por la escena 3D. El cliente autenticado también consume respuestas con `data`.

El servidor no utiliza CAMPUS_ID, MAP_VERSION ni MAP_STATUS en el .env: eran parámetros del script de carga inicial eliminado. El campus solicitado llega en /api/v1/maps/:campusId/active, el repository filtra status=ACTIVE y la versión devuelta pertenece al documento almacenado en MongoDB. La misma API puede resolver distintos campus válidos sin cambiar el entorno del proceso.

## Diagnosticar un mapa que no carga

La ruta del mapa activo exige dos datos compatibles:

1. Un registro en public.campus de Supabase con el UUID solicitado y activo=true.
2. Un documento en campus_maps de MongoDB con el mismo campusId y status=ACTIVE.

GET /api/v1/maps/:campusId/active devuelve 404 si falta cualquiera de esas referencias. Una conexión saludable o una colección existente no garantiza que haya contenido válido para ese campus. El health general solo confirma que HTTP responde.

Para el mapa actual:

~~~sh
curl http://localhost:3000/api/v1/maps/22222222-2222-4222-8222-222222222222/active
~~~

El campus San Andres está vinculado a DUOC UC en el proyecto Supabase configurado. La referencia se creó el 2026-10-08 para el UUID que ya usaba el mapa; no es una migración ni se crea automáticamente al arrancar. Si se cambia de proyecto Supabase/Atlas, preparar sus referencias válidas antes de consultar el mapa. El backend conserva el documento bajo `data`, el cliente Expo lo desenvuelve y la comprobación del campus debe mantenerse.

El frontend consume EXPO_PUBLIC_API_URL desde su propio entorno y utiliza el campus configurado en mapApi.ts. En un teléfono, la URL debe ser accesible desde ese dispositivo; localhost apunta al teléfono. Después de corregir un fallo de carga, recargar la pantalla para repetir la solicitud.

## Supabase y autenticación

F2.3-02 usa `dominio_institucional`, `campus` y `perfil_usuario` del esquema existente. Express valida el dominio DuocUC y el campus activo, confirma el correo mediante Supabase Auth y crea el perfil existente solo después de verificar la identidad. La migración no crea tablas ni columnas: ajusta RLS/permisos e integridad campus-institución y configura `duocuc.cl` en el catálogo actual. Si encuentra vacía la tabla temporal de la versión anterior, la elimina; si tiene registros, se detiene para protegerlos. Nombre y campus viajan como metadatos de Auth y el backend los vuelve a validar antes de crear el perfil; esos metadatos nunca conceden permisos. Consulta la [guía de instalación y comprobación](docs/institutional-registration.md).

El cliente técnico es compartido y nunca recibe una sesión de usuario. Si hay una clave de servidor, se utiliza para sondas y referencias; si no, se usa la clave pública con RLS. Una consulta vacía bajo RLS prueba que la operación terminó, no que el usuario pueda leer todas las filas. Una clave secret/service_role puede eludir RLS y nunca debe enviarse a Expo.

createUserSupabaseClient crea un contexto independiente con la clave pública y el Bearer del usuario. Antes de utilizarlo en futuras rutas protegidas se debe validar el JWT y los permisos vigentes; crear este cliente no verifica la identidad ni autoriza la acción.

F2.3-01 conecta `verifyAuthConnection(accessToken)` con `requireAuthentication` y `GET /api/v1/auth/me`. El middleware acepta un único header `Authorization: Bearer <access_token>`, verifica identidad en Supabase mediante `getUser(token)` y luego consulta perfil y asignaciones vigentes bajo RLS. No utiliza metadatos del JWT para conceder capacidades ni cachea estado, campus o permisos.

`/me` responde con `{ data: { userId, campusId, profile, roles, permissions } }`. `profile` contiene únicamente `id`, `institucion_id`, `campus_id`, `nombre_completo`, `foto_path`, `verificado_en`, `estado_cuenta` y `deleted_at`. Cada rol o permiso tiene `{ id, name, campusId }`, conserva el campus de su asignación y excluye registros revocados. Los permisos explícitos se devuelven separados de los roles; el catálogo y la herencia de capacidades siguen pendientes de resolución en F2.2-10/F2.3-05. El endpoint no recibe un UUID del cliente ni devuelve tokens.

Credenciales ausentes, malformadas, inválidas o vencidas producen 401 `UNAUTHENTICATED` y `WWW-Authenticate: Bearer`. Un perfil ausente, suspendido, desactivado o eliminado produce 403 `FORBIDDEN`; fallos de Auth/PostgreSQL producen 503 `DEPENDENCY_UNAVAILABLE` sin detalles del proveedor. La respuesta incluye `Cache-Control: no-store`, también ante errores. En nuevas rutas, colocar `requireAuthentication` antes de la autorización por operación y la lógica de negocio; el contexto verificado queda en `response.locals.auth`.

Aplicar `src/database/supabase/migrations/f2_3_01_autenticacion.sql` mediante una conexión de propietario, después de las tablas relacionales existentes. Es una migración versionada, no un script de arranque ni el snapshot `CampusLink_Schema.sql`. Habilita RLS en perfil, asignaciones y sus catálogos; permite exclusivamente lecturas propias a `authenticated` y retira los privilegios directos de escritura de `anon`/`authenticated` para impedir autoasignaciones o cambios de estado. Incluye políticas restrictivas para que una política SELECT permisiva anterior no amplíe ese acceso. Flujos administrativos y de actualización de perfil futuros deberán definir sus contratos de escritura explícitos. No usa el secreto técnico del servidor para eludir estas políticas.

Expo incorpora `AuthProvider`, `useAuth()` y `getSupabaseClient()` bajo `src/features/auth`. Configurar `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (o el alias legado `EXPO_PUBLIC_SUPABASE_ANON_KEY`) y `EXPO_PUBLIC_API_URL` en `frontendclink/.env`. El cliente rechaza claves secret/service_role; un secreto nunca debe introducirse en una variable `EXPO_PUBLIC_*`, pues Expo la incluye en el bundle. Usa persistencia AsyncStorage en dispositivos, persistencia web del SDK y renovación mientras la aplicación está activa; restaura la sesión y consulta `/me` al cambiar la sesión o volver al primer plano. Las consultas canceladas no pueden restaurar un contexto anterior al cierre/cambio de sesión. `authenticatedRequest` adjunta el token actual únicamente a rutas relativas `/api/v1/` del backend configurado.

`useAuth()` expone `session`, `identity`, `status`, `error` y `refreshIdentity()`. Solo `status === 'ready'` ofrece un contexto de perfil utilizable; una sesión local por sí sola no autoriza operaciones. Los estados son `loading`, `signedOut`, `ready`, `forbidden`, `error` y `unconfigured`. `refreshIdentity()` descarta inmediatamente el contexto previo y repite la consulta. El SDK queda disponible para los flujos de registro/login/recuperación de F2.3-02/F2.3-03. La bienvenida y la ruta actual de mapa conservan su acceso existente hasta las tareas de autorización F2.2-07/F2.2-10/F2.3-06.

Decisión del usuario (2026-10-08): el administrador hereda funciones institucionales. Falta sincronizar F2.2-10 y cerrar el catálogo de roles fijos; no se implementó una matriz de permisos provisional.

## Esquemas y verificaciones

CampusLink_Schema.sql es un snapshot de referencia, no una migración ejecutable. No se ejecuta durante el arranque. Las tablas deben estar aplicadas mediante las migraciones de F2.2-01. El bootstrap documental requiere campus_maps, activities y activity_participation para las sondas actuales. El nombre singular activity_participation corresponde al modelo de Atlas informado por el usuario el 2026-10-08; el bootstrap documental histórico usa otro nombre y campos distintos para activities. No ejecutarlo para corregir conectividad.

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

Las colecciones esperadas del modelo actual son campus_maps, activities, activity_participation, activity_interactions y moderation_logs. Las sondas de arranque requieren las tres primeras; las otras corresponden a operaciones futuras. Una colección existente vacía es válida; una ausente falla. La API no crea colecciones ni aplica migraciones durante el arranque. Versionar el modelo, sus validadores e índices corresponde a F2.2-02.

## Trabajo posterior

- Implementar flujos de negocio bajo sus tareas de backlog, con autorización explícita y campus vigente.
- Completar aislamiento, catálogo de roles, RLS y pruebas permitidas/prohibidas de acceso por campus.
- Completar idempotencia/historial de eventos para KPI; el health no demuestra cobertura analítica.
- Integrar moderación de actividades en reports cuando corresponda; su health inicial comprueba el registro relacional de denuncias.
- Incorporar actividades como módulo futuro con las mismas cinco capas.

## Referencias técnicas

[Inicialización Supabase JS](https://supabase.com/docs/reference/javascript/initializing), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [Auth en React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y [opciones de MongoDB Node](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/).
