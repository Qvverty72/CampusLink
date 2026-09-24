# Cambios de la rama `JP_cluster`

## 1. Alcance y estado actual

Este documento describe el estado de la rama al 23 de septiembre de 2026, incluyendo archivos modificados, eliminados y nuevos que todavía aparecen en el working tree.

La rama actualmente apunta al commit:

```text
1d287ef Supabase agregado al repo con pull
```

El historial visible no muestra commits posteriores a ese punto. Por tanto, los cambios descritos en este documento todavía no forman parte de un commit nuevo: están como cambios locales, archivos nuevos o eliminaciones pendientes de revisar y confirmar.

El estado observado fue:

```text
D  backendclink/.env.example
M  backendclink/package.json
M  backendclink/src/config/env.ts
D  backendclink/src/database/supabase/repositories/.gitkeep
M  backendclink/src/server.ts
?? backendclink/MONGODB_CONNECTION.md
?? backendclink/package-lock.json
?? backendclink/scripts/seedCampusMapFromFloors.ts
?? backendclink/src/config/mongodb.ts
?? backendclink/src/database/mongodb/001_create_collections.mongosh.js
?? backendclink/src/database/mongodb/client.ts
?? backendclink/src/modules/maps/map.controller.ts
?? backendclink/src/modules/maps/map.repository.ts
?? backendclink/src/modules/maps/map.routes.ts
?? backendclink/src/modules/maps/map.service.ts
?? backendclink/src/modules/maps/map.types.ts
?? backendclink/supabase/seed/001_base_catalogs.sql
?? backendclink/supabase/seed/README.md
?? package-lock.json
?? package.json
```

Las letras significan:

- `M`: archivo versionado modificado.
- `D`: archivo versionado eliminado en el working tree.
- `??`: archivo nuevo todavía no agregado al índice de Git.

Este documento debe leerse junto con el diff real de Git. No reemplaza una revisión antes del commit.

## 2. Contexto del proyecto

CampusLink es una aplicación móvil con un backend REST. La arquitectura actual separa:

- Frontend Expo/React Native para navegación, marketplace y mapa 3D.
- Backend Node.js, Express y TypeScript.
- Supabase/PostgreSQL para datos relacionales, usuarios, permisos y catálogos.
- MongoDB Atlas para documentos asociados al mapa, edificios, pisos, POIs y futuras actividades.

La necesidad que originó estos cambios fue persistir la configuración del mapa 3D que hasta ahora vivía en el frontend, y preparar el backend para consultar y administrar mapas y actividades sin mezclar la persistencia documental con el esquema relacional de Supabase.

La fuente de configuración del mapa continúa siendo:

```text
frontendclink/src/three/data/floors.ts
```

El objetivo del seed es transformar esa configuración estática en un documento versionado dentro de MongoDB, en la colección `campus_maps`.

## 3. Dependencias y configuración de Node.js

### 3.1 Cambio en `backendclink/package.json`

Se agregó el driver oficial de MongoDB:

```json
"mongodb": "^7.6.0"
```

El driver proporciona `MongoClient`, `Db`, operaciones sobre colecciones, consultas, actualizaciones, índices y validación de conectividad.

También cambió la versión declarada de los tipos de Node:

```json
"@types/node": "^26.6.2"
```

La razón es que varios archivos nuevos usan APIs nativas de Node como:

- `node:dns`.
- `node:crypto`.
- `process.env`.
- `process.exit`.
- `process.exitCode`.

Sin los tipos de Node, TypeScript reporta errores como `Cannot find name 'process'` y no reconoce imports `node:*`.

### 3.2 Archivos lock

Aparecen dos archivos nuevos:

```text
backendclink/package-lock.json
package-lock.json
```

El lockfile de `backendclink` corresponde al backend y registra la instalación del driver de MongoDB y sus dependencias.

El `package-lock.json` de la raíz acompaña al `package.json` raíz no rastreado. Este segundo par parece corresponder a una instalación de tipos de Node en la raíz del repositorio, porque el archivo raíz contiene solamente:

```json
{
  "devDependencies": {
    "@types/node": "^26.6.2"
  }
}
```

Antes de hacer commit hay que decidir si el proyecto debe tener una configuración npm raíz. Si no se usa, esos dos archivos raíz deberían revisarse y posiblemente no incluirse. No se deben eliminar automáticamente si son cambios del usuario.

## 4. Variables de entorno

### 4.1 Cambio en `backendclink/src/config/env.ts`

Se añadieron estas variables:

```ts
const mongodbUri = process.env.MONGODB_URI;
const mongodbDbName = process.env.MONGODB_DB_NAME;
```

Se validan durante la carga de configuración:

```ts
if (!mongodbUri) {
  throw new Error('MONGODB_URI is required');
}

if (!mongodbDbName) {
  throw new Error('MONGODB_DB_NAME is required');
}
```

La configuración exportada ahora incluye:

```ts
export const env = {
  mongodbDbName,
  mongodbUri,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port,
};
```

El comportamiento es intencional:

1. Se carga el entorno.
2. Se valida el puerto.
3. Se valida la URI de MongoDB.
4. Se valida el nombre de la base.
5. Si falta un valor obligatorio, la aplicación falla temprano.

Esto evita iniciar una API que aparentemente está disponible pero no puede guardar ni consultar datos.

### 4.2 Estado de `.env.example`

`backendclink/.env.example` aparece como eliminado (`D`) en el estado actual de Git. Esto es diferente del contenido documentado anteriormente, que incluía:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=campuslink
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

La eliminación debe revisarse antes del commit. Mantener un `.env.example` es útil porque permite documentar los nombres de variables sin exponer secretos. Si se restaura, debe contener únicamente valores de ejemplo.

El archivo real `backendclink/.env` existe localmente y contiene configuración de MongoDB, incluyendo una credencial. Está excluido por `.gitignore`, pero cualquier credencial que haya sido compartida, copiada a logs o publicada accidentalmente debe rotarse en MongoDB Atlas.

Nunca debe incluirse el valor real de `MONGODB_URI` en este documento, en el frontend, en una respuesta HTTP ni en un commit.

## 5. Clientes de MongoDB presentes

La rama contiene dos implementaciones de cliente MongoDB. Esto es importante porque no son la misma abstracción.

### 5.1 `backendclink/src/database/mongodb/client.ts`

Este es el cliente conectado al arranque del servidor.

```ts
const client = new MongoClient(env.mongodbUri);
```

Expone:

```ts
connectMongoDB(): Promise<Db>
getMongoDB(): Db
closeMongoDB(): Promise<void>
```

`connectMongoDB()`:

1. Ejecuta `client.connect()`.
2. Ejecuta `db.command({ ping: 1 })`.
3. Imprime el nombre de la base conectada.
4. Devuelve la instancia de `Db`.

`getMongoDB()` devuelve la base configurada para que los repositorios reutilicen el cliente global.

`closeMongoDB()` cierra el cliente durante el apagado.

La instancia se crea fuera de las funciones para reutilizar el pool del driver. Crear un `MongoClient` por consulta produciría conexiones innecesarias, más latencia y mayor consumo del cluster.

### 5.2 `backendclink/src/config/mongodb.ts`

Este archivo nuevo contiene otra implementación:

```ts
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME ?? 'campuslink';
const client = new MongoClient(uri);
let dbPromise: Promise<Db> | null = null;
```

Expone:

```ts
getMongoDb(): Promise<Db>
closeMongo(): Promise<void>
```

Su estrategia es crear una promesa compartida de conexión:

```ts
dbPromise = client.connect().then(() => client.db(dbName));
```

Actualmente `src/server.ts` usa el cliente de `src/database/mongodb/client.ts`, no este cliente de `src/config/mongodb.ts`.

Esto significa que la rama tiene dos puntos potenciales de conexión y dos nombres de API:

| Archivo | Funciones | Uso actual |
|---|---|---|
| `src/database/mongodb/client.ts` | `connectMongoDB`, `getMongoDB`, `closeMongoDB` | Sí, conectado al arranque del servidor |
| `src/config/mongodb.ts` | `getMongoDb`, `closeMongo` | No aparece conectado al servidor |

Antes de crecer el módulo de mapas conviene elegir una sola abstracción. Mantener ambas puede provocar que distintos módulos creen o gestionen clientes de forma inconsistente.

## 6. Arranque y apagado del backend

### 6.1 Cambio en `backendclink/src/server.ts`

Antes, el servidor arrancaba directamente:

```ts
app.listen(env.port, () => {
  console.log(`CampusLink API running on port ${env.port}`);
});
```

Ahora el arranque es asincrónico:

```ts
async function startServer(): Promise<void> {
  await connectMongoDB();

  const server = app.listen(env.port, () => {
    console.log(`CampusLink API running on port ${env.port}`);
  });
}
```

El nuevo orden es:

```text
dotenv/config
    -> carga .env
config/env.ts
    -> valida PORT, MONGODB_URI y MONGODB_DB_NAME
connectMongoDB()
    -> conecta y hace ping
app.listen()
    -> abre el servidor HTTP
```

La decisión de conectar antes de `app.listen()` hace que la aplicación falle temprano si la base está caída, la URI es incorrecta, el usuario no tiene permisos o la IP no está autorizada en Atlas.

### 6.2 Manejo de errores de arranque

El arranque tiene un `catch` global:

```ts
startServer().catch((error: unknown) => {
  console.error('Unable to start CampusLink API', error);
  process.exit(1);
});
```

Esto evita dejar un proceso parcialmente iniciado cuando la conexión no funciona.

### 6.3 Apagado ordenado

Se registran manejadores para:

- `SIGINT`, normalmente producido al detener el proceso desde la terminal.
- `SIGTERM`, usado habitualmente por Docker y proveedores de despliegue.

El flujo de apagado es:

1. Se registra la señal.
2. Se llama a `server.close()` para dejar de aceptar conexiones nuevas.
3. Se espera el callback de cierre HTTP.
4. Se llama a `closeMongoDB()`.
5. Se termina con código `0`.

Esto evita dejar conexiones abiertas innecesariamente y permite a los despliegues detener el contenedor de manera limpia.

## 7. Script de seed del mapa

### Archivo

```text
backendclink/scripts/seedCampusMapFromFloors.ts
```

### Objetivo

El script convierte los datos del mapa definidos en el frontend en un documento persistente de MongoDB.

La fuente es:

```text
frontendclink/src/three/data/floors.ts
```

La colección destino es:

```text
campus_maps
```

El seed no crea un documento por edificio o por piso. Crea un documento de mapa que contiene los edificios, sus pisos, la metadata del modelo y la versión.

### Variables usadas

```env
MONGODB_URI=...
MONGODB_DB_NAME=campuslink
CAMPUS_ID=22222222-2222-4222-8222-222222222222
MAP_VERSION=1
MAP_STATUS=ACTIVE
```

`MONGODB_URI` es obligatoria.

`MONGODB_DB_NAME` tiene fallback a `campuslink` si no está definida.

`CAMPUS_ID` es obligatoria y representa el UUID lógico del campus de Supabase. El script exige que exista, pero en la versión actual no valida con una expresión regular que tenga formato UUID; esa validación está definida en el validador MongoDB.

`MAP_VERSION` se convierte a número y debe ser un entero positivo. Si no existe, se usa `1`.

`MAP_STATUS` se limita en tiempo de ejecución a:

- `DRAFT`.
- `ACTIVE`.
- `ARCHIVED`.

Si no existe, se usa `ACTIVE`.

### Configuración DNS

Al principio del archivo aparece:

```ts
import dns from 'node:dns';

dns.setServers(['1.1.1.1', '8.8.8.8']);
```

La intención es forzar servidores DNS públicos para resolver la URI `mongodb+srv` cuando el DNS local presenta problemas.

Sin embargo, esta decisión tiene costes y riesgos:

- Ignora la configuración DNS corporativa, de VPN o de Docker.
- Puede ser incompatible con redes que bloquean consultas DNS externas.
- Hace que el script dependa de servicios externos concretos.
- Herramientas de análisis estático reportan las IPs hardcodeadas como una posible configuración insegura.
- Puede ser innecesario si la resolución DNS local funciona correctamente.

El error de `get_errors` señaló específicamente las IPs `1.1.1.1` y `8.8.8.8` como valores hardcodeados que deben revisarse. Es una advertencia de seguridad/configuración, no una prueba de que Atlas esté rechazando la conexión.

### Normalización de escala

La función `normalizeScale()` acepta:

```ts
number | [number, number, number] | undefined
```

y siempre devuelve una tupla de tres números:

- Si recibe un arreglo, copia sus valores.
- Si recibe un número, lo repite en los tres ejes.
- Si recibe `undefined`, usa `1` en los tres ejes.

Esto permite guardar todas las escalas en un formato uniforme dentro de MongoDB:

```ts
scale: [x, y, z]
```

### Construcción de edificios y pisos

El script crea un índice de configuraciones de malla:

```ts
const meshByName = new Map(
  floorMeshConfigs.map((item) => [item.meshName, item]),
);
```

Después recorre `buildingConfigs`. Para cada edificio guarda:

- `id`.
- `name`.
- `focusTarget`.
- `focusPosition`.
- `floors`.

Para cada piso combina:

- La definición semántica de `floorData`.
- La configuración visual de `floorMeshConfigs`.

Cada piso generado incluye:

- `id`.
- `level`.
- `meshName`.
- `name`.
- `description`.
- `transform.position`.
- `transform.rotation`.
- `transform.scale`.
- `subMeshes`.
- `pois`.

Si un piso está declarado en un edificio pero no existe en `floorData` o en `floorMeshConfigs`, el script detiene el seed con:

```text
Missing floor data/config for <floorId>
```

La comprobación evita almacenar documentos incompletos que luego no podrían renderizarse correctamente.

### Hash de la fuente

Se calcula un hash SHA-256:

```ts
const sourceHash = createHash('sha256')
  .update(JSON.stringify({ buildingConfigs, floorData, floorMeshConfigs }))
  .digest('hex');
```

El hash se guarda dentro de:

```json
{
  "model": {
    "sourceHash": "..."
  }
}
```

El propósito es identificar qué versión de la configuración del frontend produjo el documento. Si cambian edificios, pisos, posiciones o mallas, el contenido serializado cambia y normalmente también cambia el hash.

### Preservación de POIs

Antes de reemplazar el documento, el script consulta la misma combinación de campus y versión:

```ts
const existing = await collection.findOne({ campusId, version });
```

Luego recorre los edificios y pisos existentes, y guarda sus POIs en un mapa indexado por `floor.id`.

Al construir el nuevo documento, restaura los POIs existentes:

```ts
pois: existingPois.get(floor.id) ?? []
```

Esto permite volver a ejecutar el seed después de modificar la geometría o metadata del mapa sin borrar los puntos de interés ya registrados para esa versión.

La preservación depende de que el `floor.id` permanezca estable. Si se cambia el identificador de un piso, sus POIs anteriores no se podrán asociar automáticamente.

### Documento producido

El documento incluye:

```text
campusId
version
schemaVersion
status
model
buildings
updatedAt
activatedAt
archivedAt
createdAt, al insertar por primera vez
```

La metadata del modelo es:

```text
model.key       = campus-main
model.assetPath = frontendclink/assets/models/modelomejoradojunto.glb
model.dataSource = frontendclink/src/three/data/floors.ts
model.sourceHash = hash SHA-256
```

Las fechas de estado funcionan así:

- `activatedAt` recibe la fecha actual cuando el estado es `ACTIVE`; en otro caso queda en `null`.
- `archivedAt` recibe la fecha actual cuando el estado es `ARCHIVED`; en otro caso queda en `null`.
- `updatedAt` siempre recibe la fecha actual.
- `createdAt` se conserva al actualizar y se asigna al insertar.

### Activación de una versión

Si el seed se ejecuta con `MAP_STATUS=ACTIVE`, primero archiva otras versiones activas del mismo campus:

```ts
await collection.updateMany(
  { campusId, status: 'ACTIVE', version: { $ne: version } },
  {
    $set: {
      status: 'ARCHIVED',
      archivedAt: now,
      updatedAt: now,
    },
  },
);
```

Después hace un upsert por:

```text
{ campusId, version }
```

Esto permite:

- Insertar una versión nueva.
- Actualizar una versión existente.
- Evitar duplicados cuando existe el índice único correspondiente.
- Mantener como activa solamente la versión seleccionada para el campus.

### Cierre del cliente

El script crea su propio `MongoClient` porque es un proceso independiente del servidor HTTP:

```ts
const client = new MongoClient(uri);
```

Usa `try/finally` para llamar siempre a:

```ts
await client.close();
```

El cliente global del servidor no se reutiliza porque el seed se ejecuta como un proceso separado mediante `tsx`.

### Ejecución

Desde `backendclink`:

```powershell
npx tsx scripts/seedCampusMapFromFloors.ts
```

El comando se ejecutó en el entorno actual y terminó con código de salida `0` según el estado de la terminal.

El mensaje esperado es similar a:

```text
Seeded campus map: <buildings> buildings, <floors> floors, version <version>, status <status>
```

Si falla, el bloque final imprime:

```text
Failed to seed campus map:
```

seguido del error original y establece `process.exitCode = 1`.

## 8. Esquema, validadores e índices de MongoDB

### Archivo

```text
backendclink/src/database/mongodb/001_create_collections.mongosh.js
```

Es un script para ejecutar con `mongosh`. No se ejecuta automáticamente desde Express, `npm run build`, `npm start` ni desde el seed TypeScript.

Selecciona la base mediante:

```js
const targetDbName = process.env.MONGODB_DB_NAME || 'campuslink';
db = db.getSiblingDB(targetDbName);
```

### Función `recreateValidator`

La función comprueba si existe una colección:

- Si no existe, llama a `db.createCollection()`.
- Si existe, llama a `collMod`.

En ambos casos aplica:

```text
validationLevel: strict
validationAction: error
```

La validación rechaza documentos que no respeten el esquema en lugar de aceptar silenciosamente datos incompatibles.

### Colección `campus_maps`

Campos obligatorios de nivel raíz:

- `campusId`.
- `version`.
- `schemaVersion`.
- `status`.
- `model`.
- `buildings`.
- `createdAt`.
- `updatedAt`.

`campusId` debe ser un string con formato UUID.

`version` y `schemaVersion` deben ser enteros mayores o iguales a `1`.

`status` se limita a:

```text
DRAFT | ACTIVE | ARCHIVED
```

`model` exige:

- `key`.
- `assetPath`.
- `dataSource`.
- `sourceHash`.

Cada edificio exige:

- `id`.
- `name`.
- `focusTarget`.
- `focusPosition`.
- `floors`.

Cada vector se define como un arreglo de exactamente tres valores numéricos BSON.

Cada piso exige:

- `id`.
- `level`.
- `meshName`.
- `name`.
- `description`.
- `transform`.
- `subMeshes`.
- `pois`.

`transform` exige `position`, `rotation` y `scale`, todos como vectores de tres elementos.

Cada POI exige:

- `id`.
- `code`.
- `name`.
- `type`.
- `positionLocal`.
- `active`.
- `createdAt`.
- `updatedAt`.

Los tipos permitidos de POI son:

```text
AUDITORIUM
CAFETERIA
LIBRARY
CHAPEL
LAB
OFFICE
SPORTS
SERVICE
OTHER
```

`description` e `iconKey` pueden ser string o `null`.

### Colección `activities`

Campos obligatorios:

- `campusId`.
- `creatorUserId`.
- `mapId`.
- `type`.
- `title`.
- `description`.
- `startsAt`.
- `endsAt`.
- `location`.
- `status`.
- `createdAt`.
- `updatedAt`.

Los tipos permitidos de actividad son:

```text
COMMUNITY_ACTIVITY
OFFICIAL_EVENT
STUDY_GROUP
WORKSHOP
SPORT
```

`location` exige `buildingId` y `floorId`, y admite opcionalmente `poiId` y `positionLocal`.

La recurrencia admite:

- `DAILY`.
- `WEEKLY`.
- `MONTHLY`.
- `interval` entero mínimo `1`.
- `daysOfWeek` entre `0` y `6`.
- `until` o `count` como límites opcionales.

Los estados de actividad son:

```text
ACTIVE | CANCELLED | FINISHED | HIDDEN
```

### Colección `activity_participations`

Campos obligatorios:

- `activityId`.
- `campusId`.
- `userId`.
- `role`.
- `status`.
- `joinedAt`.
- `updatedAt`.

Roles:

```text
CREATOR | PARTICIPANT
```

Estados:

```text
REGISTERED | CANCELLED
```

### Índices creados

En `campus_maps`:

```text
{ campusId: 1, version: 1 }
```

Es único y se llama `campus_version_uq`. Impide dos documentos para el mismo campus y versión.

```text
{ campusId: 1, status: 1 }
```

Es único con filtro parcial `status: ACTIVE` y se llama `one_active_map_per_campus`. Su objetivo es permitir como máximo un mapa activo por campus.

En `activities`:

- `activity_campus_status_start_idx` sobre `campusId`, `status`, `startsAt`.
- `activity_creator_idx` sobre `creatorUserId`, `createdAt` descendente.
- `activity_map_idx` sobre `mapId`.
- `activity_floor_idx` sobre `location.floorId`.
- `activity_poi_idx` sobre `location.poiId`, sparse.

En `activity_participations`:

- `activity_user_uq` único sobre `activityId`, `userId`.
- `participation_user_status_idx` sobre `userId`, `status`.
- `participation_campus_status_idx` sobre `campusId`, `status`.

### Ejecución

El script debe ejecutarse con `mongosh` y con una URI válida, por ejemplo mediante una forma equivalente a:

```powershell
mongosh "$env:MONGODB_URI" --file src/database/mongodb/001_create_collections.mongosh.js
```

La sintaxis exacta puede variar según la versión de `mongosh` y el entorno. El script imprime las colecciones, mapas activos e índices después de aplicar la configuración.

## 9. Seeds de Supabase

### 9.1 Archivo `backendclink/supabase/seed/001_base_catalogs.sql`

Este seed carga datos maestros relacionales para un entorno nuevo de Supabase.

Es idempotente en el sentido de que usa `on conflict` para actualizar o ignorar registros existentes.

Carga:

- Institución `Duoc UC`.
- Campus `Sede Concepción`.
- Rol `USUARIO_INSTITUCIONAL`.
- Rol `USUARIO_AUTORIZADO`.
- Rol `ADMINISTRADOR`.
- Permiso `VER_REPORTES`.
- Permiso `VER_AUDITORIA`.
- Permiso `MODERAR_CONTENIDO`.
- Permiso `GESTIONAR_ROLES_PERMISOS`.
- Relación entre `ADMINISTRADOR` y esos permisos.

El campus usa este UUID estable cuando se ejecuta sobre una base vacía:

```text
22222222-2222-4222-8222-222222222222
```

Ese mismo valor puede usarse como `CAMPUS_ID` del seed de MongoDB.

El SQL no carga:

- Usuarios.
- Perfiles.
- Carreras.
- Asignaturas.
- Publicaciones.
- Solicitudes.
- Transacciones.

La razón es separar los datos maestros de los datos que se crean durante el uso normal de la aplicación.

El archivo termina con consultas de verificación para revisar el campus, la institución, los roles y los permisos.

### 9.2 Archivo `backendclink/supabase/seed/README.md`

La documentación del seed explica:

- La diferencia entre migraciones y seeds.
- La relación lógica entre UUIDs de Supabase y documentos MongoDB.
- Que MongoDB usa su propio `_id`/`ObjectId`.
- Que no existe una FK física entre PostgreSQL y MongoDB.
- Que la consistencia entre ambos motores debe validarse en el backend.
- Cómo ejecutar el SQL desde Supabase SQL Editor.
- Cómo consultar el UUID real del campus.
- Qué catálogos académicos podrían agregarse en un seed futuro.
- Que credenciales y claves nunca deben versionarse.

Esta separación es necesaria porque una migración define estructura, mientras un seed define datos iniciales reproducibles.

### 9.3 Eliminación de `.gitkeep`

Se eliminó:

```text
backendclink/src/database/supabase/repositories/.gitkeep
```

La carpeta deja de necesitar un archivo marcador porque ya existen otras piezas reales de persistencia y seeds. Antes del commit debe confirmarse que la carpeta vacía no sea requerida por alguna convención del equipo.

## 10. Módulo de mapas

Se crearon estos archivos:

```text
backendclink/src/modules/maps/map.controller.ts
backendclink/src/modules/maps/map.repository.ts
backendclink/src/modules/maps/map.routes.ts
backendclink/src/modules/maps/map.service.ts
backendclink/src/modules/maps/map.types.ts
```

Actualmente los cinco archivos están vacíos.

Por tanto, representan una frontera arquitectónica preparada para separar:

- Tipos y contratos del mapa.
- Acceso a MongoDB.
- Reglas de negocio.
- Controladores HTTP.
- Rutas Express.

Pero todavía no implementan endpoints, consultas, validaciones ni lógica de negocio.

Tampoco aparecen registrados en `backendclink/src/routes/index.ts`. La única ruta registrada explícitamente en ese archivo sigue siendo:

```text
GET /api/v1/health
```

Por esa razón, crear los archivos del módulo no expone todavía rutas de mapas al frontend.

## 11. Relación con el frontend

El seed importa directamente:

```ts
import {
  buildingConfigs,
  floorData,
  floorMeshConfigs,
} from '../../frontendclink/src/three/data/floors.ts';
```

Esto reduce duplicación: los datos de posiciones, pisos y edificios se mantienen en una sola fuente.

También crea un acoplamiento deliberado entre backend y frontend:

- Cambios en la ruta del archivo rompen el seed.
- Cambios en los tipos del frontend pueden afectar la compilación del seed.
- Cambios en los IDs de edificios o pisos pueden impedir conservar POIs.
- El backend depende de que la configuración siga siendo importable en ejecución con `tsx`.

Este acoplamiento es aceptable para el seed inicial, pero a futuro podría reemplazarse por un formato compartido o un archivo de datos común si el dominio crece.

El documento de MongoDB guarda además rutas de referencia al modelo y a la fuente:

```text
frontendclink/assets/models/modelomejoradojunto.glb
frontendclink/src/three/data/floors.ts
```

Estas rutas son metadata; MongoDB no copia ni valida el archivo GLB.

## 12. Errores y advertencias observados

### 12.1 Diagnósticos iniciales del seed

El diagnóstico de editor reportó errores como:

```text
Cannot find name 'node:dns'
Cannot find name 'node:crypto'
Cannot find name 'process'
Parameter 'floorId' implicitly has an 'any' type
Parameter 'floor' implicitly has an 'any' type
```

La causa principal es que el `tsconfig.json` del backend incluye solamente:

```json
"include": ["src/**/*.ts"]
```

El script está en `scripts/`, fuera de ese patrón. Además, un diagnóstico anterior no estaba usando correctamente los tipos de Node disponibles en el `package.json` del backend.

La dependencia `@types/node` fue ajustada en el backend. Sin embargo, el script no se valida mediante el `npm run typecheck` actual, porque dicho comando solo cubre `src/**/*.ts`.

### 12.2 Advertencia por DNS hardcodeado

El editor también reportó que las IPs `1.1.1.1` y `8.8.8.8` están hardcodeadas en `dns.setServers()`.

La advertencia no significa necesariamente que MongoDB esté mal configurado. Señala que el código fuerza infraestructura externa y que la elección debe ser explícita y revisada.

### 12.3 Riesgo de credenciales

La configuración local contiene una URI de MongoDB con usuario y contraseña. Aunque `backendclink/.env` está ignorado, la credencial debe considerarse sensible. Si fue expuesta en una conversación, log, captura o commit, debe revocarse o rotarse desde MongoDB Atlas.

## 13. Validaciones ejecutadas

### 13.1 TypeScript del backend

Se ejecutó:

```powershell
cd backendclink
npm run typecheck
```

El comando terminó correctamente para los archivos incluidos por el `tsconfig.json`.

### 13.2 Build del backend

Se ejecutó:

```powershell
cd backendclink
npm run build
```

El comando terminó con código `0` y generó la salida compilada en `backendclink/dist`.

### 13.3 Ejecución del seed

Se ejecutó:

```powershell
npx tsx scripts/seedCampusMapFromFloors.ts
```

Desde el directorio `backendclink`, la terminal reportó código de salida `0`.

### 13.4 Prueba de red

También se probó conectividad TCP contra un host del cluster MongoDB en el puerto `27017` mediante `Test-NetConnection`.

Una prueba TCP exitosa solamente confirma que el puerto es accesible. No sustituye la autenticación, el handshake TLS, la resolución completa de `mongodb+srv` ni el `ping` autenticado del driver.

## 14. Qué está implementado y qué no

### Implementado

- Dependencia oficial de MongoDB para el backend.
- Variables de entorno para URI y nombre de base.
- Validación de configuración obligatoria.
- Cliente MongoDB reutilizable en el servidor.
- Conexión antes de iniciar Express.
- Ping de MongoDB durante el arranque.
- Cierre ordenado en señales de sistema.
- Seed del mapa desde la configuración del frontend.
- Versionado de mapas por `campusId` y `version`.
- Estados `DRAFT`, `ACTIVE` y `ARCHIVED`.
- Preservación de POIs al actualizar la misma versión.
- Hash de la fuente del mapa.
- Validadores BSON para mapas y actividades.
- Índices para mapas, actividades y participaciones.
- Seed base de catálogos de Supabase.
- Documentación del seed de Supabase.

### Pendiente o no conectado

- Registrar rutas del módulo de mapas en `src/routes/index.ts`.
- Implementar los cinco archivos vacíos de `src/modules/maps`.
- Implementar consultas para obtener mapas desde la API.
- Implementar creación y administración de POIs.
- Implementar actividades y participaciones en el backend.
- Definir tipos compartidos para documentos MongoDB.
- Decidir entre `src/config/mongodb.ts` y `src/database/mongodb/client.ts`.
- Decidir si el script de validadores se ejecuta como migración versionada.
- Agregar un script npm para ejecutar el seed de forma documentada.
- Incluir los scripts `scripts/**/*.ts` en una validación TypeScript separada o en un `tsconfig` específico.
- Revisar si se mantiene o se elimina el DNS hardcodeado.
- Revisar el estado de `.env.example` antes de confirmar cambios.
- Revisar los `package.json` y lockfiles de la raíz.
- Agregar pruebas unitarias e integración para el seed y los repositorios.

## 15. Decisiones y motivos

### MongoDB separado de Supabase

Supabase/PostgreSQL conserva datos relacionales y reglas de integridad del dominio de usuarios, permisos y catálogos. MongoDB se usa para documentos anidados del mapa y futuras actividades, donde edificios, pisos y POIs forman una estructura naturalmente jerárquica.

### `campusId` como referencia lógica

MongoDB no puede aplicar una FK contra PostgreSQL. Por eso los documentos guardan el UUID del campus como string. La existencia del campus y la coherencia entre sistemas deben verificarse mediante la aplicación o procesos de administración.

### Mapas versionados

La versión permite publicar una nueva geometría sin perder inmediatamente la anterior. El estado `ACTIVE` identifica el mapa visible para el campus, mientras `DRAFT` permite preparar cambios y `ARCHIVED` conserva historial.

### Upsert del seed

El upsert hace que el mismo comando sea repetible para una combinación `campusId`/`version`. Esto evita insertar duplicados cada vez que se regeneran los datos desde el frontend.

### Preservación de POIs

El seed actualiza la definición estructural del mapa, pero intenta conservar datos agregados posteriormente por usuarios o administradores. Por eso no reemplaza ciegamente el arreglo `pois`.

### Validación estricta en MongoDB

Los validadores reducen el riesgo de que documentos incompletos o con estados inválidos lleguen a producción. La validación se coloca en la base porque puede haber más de un proceso escribiendo datos.

### Índices específicos

Los índices reflejan consultas y reglas del dominio:

- Buscar una versión de mapa por campus.
- Garantizar un mapa activo por campus.
- Listar actividades por campus, estado y fecha.
- Consultar actividades de un creador.
- Buscar actividades relacionadas con un mapa, piso o POI.
- Impedir que un usuario se registre dos veces en la misma actividad.

## 16. Revisión recomendada antes del commit

1. Confirmar si `.env.example` debe restaurarse con las variables de MongoDB.
2. Confirmar si los dos clientes MongoDB se consolidarán en uno.
3. Decidir si los archivos raíz `package.json` y `package-lock.json` pertenecen al proyecto.
4. Ejecutar el validador de MongoDB con `mongosh` en el cluster correcto.
5. Revisar la advertencia de `dns.setServers()` y preferir el DNS del entorno salvo que exista una razón operativa documentada.
6. Comprobar que el `CAMPUS_ID` usado en `.env` existe realmente en Supabase.
7. Verificar los índices después de ejecutar `001_create_collections.mongosh.js`.
8. Registrar el seed como script npm o documentar formalmente el comando `npx tsx`.
9. Agregar el script de seed a una configuración TypeScript validable.
10. Implementar y registrar el módulo de mapas antes de depender de endpoints desde el frontend.
11. Agregar pruebas para reejecución del seed, preservación de POIs y cambio de mapa activo.
12. Revisar credenciales y rotarlas si alguna URI real fue expuesta.

## 17. Resumen del flujo completo

```text
Supabase seed
    |
    | crea institución, campus, roles y permisos
    v
campusId estable en PostgreSQL
    |
    | CAMPUS_ID se pasa al seed MongoDB
    v
floors.ts del frontend
    |
    | buildingConfigs + floorData + floorMeshConfigs
    v
seedCampusMapFromFloors.ts
    |
    | genera hash, edificios, pisos, transforms y POIs
    | actualiza versión y estado
    v
MongoDB campus_maps
    |
    | validadores BSON + índices
    v
futuro módulo backend de mapas
    |
    | repository -> service -> controller -> routes
    v
API REST para el frontend
```

En el estado actual, la parte de persistencia y preparación de datos está avanzada, pero la capa HTTP del módulo de mapas todavía es una estructura vacía y no está conectada a las rutas de Express.
