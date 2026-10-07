# CampusLink

**CampusLink** es una aplicación móvil orientada a la comunidad estudiantil que busca centralizar recursos académicos, intercambio de artículos entre estudiantes, actividades dentro del campus y navegación mediante un mapa 3D interactivo.

El proyecto se desarrolla como **Capstone de Ingeniería en Informática** y actualmente se encuentra en una etapa de construcción e integración progresiva de sus módulos principales.

---

## ¿Qué problema busca resolver?

La información útil para la vida estudiantil suele encontrarse dispersa entre distintos canales. Esto dificulta:

- Encontrar apuntes, guías y material relacionado con una asignatura.
- Reutilizar recursos físicos entre estudiantes.
- Descubrir actividades, talleres o grupos de estudio.
- Ubicar espacios y actividades dentro del campus.
- Generar confianza durante intercambios entre estudiantes.

CampusLink busca reunir estas necesidades dentro de una sola plataforma móvil.

---

## Funcionalidades principales

### Recursos académicos

- Publicación de apuntes, guías y otros recursos digitales.
- Asociación de recursos a carreras y asignaturas.
- Búsqueda y filtrado de contenido.
- Registro de acceso e interacción con recursos.
- Sistema de reputación y valoraciones.

### Marketplace estudiantil

- Publicación de recursos físicos.
- Venta o donación entre estudiantes.
- Solicitudes y reservas.
- Confirmación de transacciones.
- Valoración posterior a los intercambios.

CampusLink **no procesa pagos electrónicos**. Los acuerdos económicos se realizan directamente entre los usuarios.

### Mapa 3D del campus

- Visualización interactiva del campus.
- Selección de edificios.
- Exploración por pisos.
- Información asociada a cada piso.
- Soporte para puntos de interés.
- Datos del mapa obtenidos dinámicamente desde el backend.

El modelo visual se maneja desde React Three Fiber y los datos estructurales del mapa se almacenan en MongoDB.

### Actividades

El modelo contempla:

- Grupos de estudio.
- Talleres.
- Actividades deportivas.
- Actividades comunitarias.
- Eventos oficiales.
- Ubicación de actividades dentro de edificios, pisos y puntos de interés.
- Participación de estudiantes en actividades.

### Recomendaciones

La arquitectura de datos contempla información suficiente para desarrollar recomendaciones considerando, entre otras señales:

- Carrera del estudiante.
- Asignaturas.
- Recursos consultados.
- Interacciones.
- Historial de acceso.
- Reputación.
- Valoraciones.
- Popularidad y demanda.

El algoritmo de recomendación todavía no se encuentra implementado.

### Administración, moderación y reportería

El alcance contempla:

- Gestión de usuarios y permisos.
- Moderación de contenido.
- Reportes y denuncias.
- Auditoría.
- Indicadores de uso.
- Analítica de recursos y transacciones.
- Información para reportería administrativa.

---

# Estado actual

> Estado general del desarrollo: **en construcción / integración**.

| Área | Estado actual |
|---|---|
| Navegación principal móvil | ✅ Implementada |
| Diseño base y componentes UI | ✅ Implementado |
| Pantallas maestras | 🟡 Implementadas con datos de demostración |
| Inicio | 🟡 Maqueta funcional |
| Marketplace | 🟡 Interfaz funcional con mocks |
| Biblioteca / recursos | 🟡 Interfaz funcional con mocks |
| Actividades | 🟡 Interfaz y flujo base con mocks |
| Autenticación | 🟡 Interfaz implementada, autenticación real pendiente |
| Mapa 3D | ✅ MVP funcional |
| Edificios y pisos | ✅ Funcionales |
| Mapa conectado al backend | ✅ Implementado |
| MongoDB | ✅ Conectado al backend |
| Endpoint de mapa activo | ✅ Implementado |
| Esquema MongoDB | ✅ Definido |
| Esquema Supabase/PostgreSQL | ✅ Definido y versionado |
| Marketplace backend | ⏳ Pendiente |
| Recursos académicos backend | ⏳ Pendiente |
| Actividades backend completas | ⏳ Pendiente |
| Recomendaciones | ⏳ Pendiente |
| Moderación | ⏳ Pendiente |
| Analítica y reportería | ⏳ Pendiente |
| Deploy de producción | ⏳ Pendiente |

Las pantallas maestras actualmente permiten validar navegación, diseño y experiencia de usuario antes de conectar cada módulo con sus servicios reales.

---

# Arquitectura

CampusLink sigue una arquitectura **Cliente-Servidor**, con separación entre presentación, lógica de aplicación y persistencia.

```text
┌────────────────────────────────────────────┐
│              Aplicación móvil              │
│                                            │
│   React Native · Expo · Expo Router        │
│   Zustand · React Three Fiber              │
│                                            │
│   Inicio · Mapa · Marketplace · Biblioteca │
└─────────────────────┬──────────────────────┘
                      │
                      │ HTTP / REST
                      ▼
┌────────────────────────────────────────────┐
│                 Backend API                │
│                                            │
│       Node.js · Express · TypeScript       │
│                                            │
│  Controllers · Services · Repositories     │
└──────────────┬─────────────────┬───────────┘
               │                 │
               ▼                 ▼
┌──────────────────────┐  ┌──────────────────────┐
│ Supabase/PostgreSQL  │  │       MongoDB        │
│                      │  │                      │
│ Dominio relacional   │  │ Mapa y actividades  │
│ Usuarios             │  │ Edificios y pisos   │
│ Recursos             │  │ POIs                 │
│ Transacciones        │  │ Participaciones      │
│ Valoraciones         │  │                      │
│ Reportería           │  │                      │
└──────────────────────┘  └──────────────────────┘
```

El frontend no accede directamente a MongoDB. Los datos del mapa se solicitan mediante la API REST del backend.

---

# Persistencia

CampusLink utiliza dos tecnologías de persistencia con responsabilidades diferentes.

## Supabase / PostgreSQL

Supabase contiene el dominio principalmente relacional de la aplicación.

El esquema actual se encuentra versionado mediante:

```text
backendclink/supabase/migrations/
└── 20260930183930_campuslink_final_schema.sql
```

La migración actual contiene **33 tablas**:

```text
institucion
campus
carrera
asignatura
campus_carrera
carrera_asignatura

perfil_usuario
usuario_carrera
usuario_asignatura

rol
permiso
rol_permiso
usuario_rol
usuario_permiso

publicacion_recurso
recurso_digital
categoria_recurso_fisico
recurso_fisico
archivo_publicacion
publicacion_carrera
publicacion_asignatura

mensaje_solicitud
solicitud_recurso
transaccion_recurso
confirmacion_transaccion
valoracion

acceso_recurso_digital
notificacion
interaccion_recurso

reporte_contenido
auditoria
reporte
dominio_institucional
```

El esquema contempla usuarios, carreras, asignaturas, publicaciones, transacciones, valoraciones, permisos, reportes, auditoría y datos necesarios para futura analítica y recomendaciones.

---

## MongoDB

MongoDB almacena información documental asociada principalmente al mapa y las actividades.

Actualmente se definen las colecciones:

```text
campus_maps
activities
activity_participations
```

### `campus_maps`

Contiene:

- Campus.
- Versión del mapa.
- Estado `DRAFT`, `ACTIVE` o `ARCHIVED`.
- Modelo 3D asociado.
- Edificios.
- Pisos.
- Transformaciones.
- Submeshes.
- Puntos de interés.

Solo puede existir **un mapa ACTIVE por campus**.

### `activities`

Contempla actividades vinculadas a:

- Campus.
- Usuario creador.
- Versión del mapa.
- Edificio.
- Piso.
- Punto de interés.
- Fecha y horario.
- Tipo de actividad.
- Estado.

### `activity_participations`

Relaciona usuarios con actividades y registra su participación.

Los identificadores UUID permiten relacionar documentos de MongoDB con entidades almacenadas en Supabase sin duplicar el dominio relacional.

El bootstrap de Mongo se encuentra en:

```text
backendclink/src/database/mongodb/
├── client.ts
└── 001_create_collections.mongosh.js
```

Este script crea o actualiza:

- Colecciones.
- Validadores JSON Schema.
- Restricciones.
- Índices.
- Reglas de unicidad.

---

# API REST

La API utiliza el prefijo:

```text
/api/v1
```

## Endpoints implementados actualmente

### Health check

```http
GET /api/v1/health
```

Respuesta:

```json
{
  "status": "ok"
}
```

### Obtener mapa activo

```http
GET /api/v1/maps/:campusId/active
```

Este endpoint obtiene desde MongoDB la versión activa del mapa correspondiente al campus.

El flujo interno sigue:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository
  ↓
MongoDB
```

El frontend consume este endpoint y adapta la respuesta al formato utilizado por el mapa 3D.

---

# Mapa 3D

El dominio del mapa se mantiene aislado del resto del frontend dentro de:

```text
frontendclink/src/three/
```

Actualmente incluye:

```text
three/
├── api/          # Comunicación con la API del mapa
├── components/   # Escena y elementos 3D
├── controls/     # Cámara e interacción
├── data/         # Datos auxiliares
├── models/       # Modelo GLB
├── store/        # Estado del mapa con Zustand
└── types/        # Contratos del dominio 3D
```

El mapa activo se carga mediante:

```text
MongoDB
   ↓
Backend
   ↓
GET /api/v1/maps/:campusId/active
   ↓
mapApi.ts
   ↓
mapDataStore.ts
   ↓
Mapa 3D
```

De esta forma, la configuración de edificios y pisos no necesita permanecer hardcodeada dentro de la aplicación.

---

# Estructura actual del repositorio

```text
CampusLink/
│
├── frontendclink/
│   ├── app/
│   │   ├── (map)/
│   │   ├── (marketplace)/
│   │   ├── (user)/
│   │   ├── auth/
│   │   ├── create/
│   │   ├── detail/
│   │   └── _layout.tsx
│   │
│   ├── assets/
│   │
│   ├── src/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── mocks/
│   │   ├── screens/
│   │   ├── store/
│   │   ├── theme/
│   │   ├── three/
│   │   └── types/
│   │
│   ├── .env.example
│   └── package.json
│
├── backendclink/
│   ├── src/
│   │   ├── config/
│   │   ├── database/
│   │   │   └── mongodb/
│   │   ├── middleware/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── campus/
│   │   │   ├── maps/
│   │   │   └── users/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── types/
│   │   ├── app.ts
│   │   └── server.ts
│   │
│   ├── supabase/
│   │   ├── migrations/
│   │   ├── config.toml
│   │   └── seed.sql
│   │
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── .env.example
│   └── package.json
│
└── README.md
```

---

# Tecnologías

## Frontend

| Tecnología | Uso |
|---|---|
| React Native | Aplicación móvil |
| Expo | Entorno de desarrollo y distribución |
| Expo Router | Navegación basada en archivos |
| TypeScript | Tipado estático |
| NativeWind / Tailwind CSS | Estilos |
| Zustand | Manejo de estado |
| Three.js | Renderizado 3D |
| React Three Fiber | Integración declarativa de Three.js con React |
| Drei | Utilidades para React Three Fiber |

Actualmente el proyecto utiliza **Expo 57**, **React Native 0.86** y **React 19**.

## Backend

| Tecnología | Uso |
|---|---|
| Node.js 22 | Runtime |
| Express | API REST |
| TypeScript | Desarrollo tipado |
| MongoDB Driver | Acceso a MongoDB |
| Supabase JS | Integración con Supabase |
| Helmet | Cabeceras de seguridad |
| CORS | Control de acceso HTTP |
| Docker | Construcción y ejecución reproducible |

## Persistencia

| Tecnología | Responsabilidad |
|---|---|
| PostgreSQL / Supabase | Dominio relacional |
| MongoDB | Mapa, actividades y participación |
| Supabase Migrations | Versionamiento del esquema relacional |
| MongoDB JSON Schema | Validación documental |

## Modelado 3D

El campus se modela mediante **Blender** y se exporta como **GLB**.

---

# Requisitos

Para trabajar con el proyecto se recomienda:

- Node.js 22.
- npm.
- Git.
- Expo Go o emulador Android/iOS.
- Docker, opcional para el backend.
- Acceso al proyecto de Supabase.
- Acceso a MongoDB.
- Supabase CLI para administrar migraciones.
- `mongosh` para tareas de configuración de MongoDB.

---

# Instalación

## 1. Clonar el repositorio

```bash
git clone https://github.com/Qvverty72/CampusLink.git
cd CampusLink
```

---

## 2. Frontend

```bash
cd frontendclink
npm install
```

Crear `.env` a partir de `.env.example`.

```env
EXPO_PUBLIC_API_URL=http://localhost:3000

EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Luego:

```bash
npm run start
```

También se encuentran disponibles:

```bash
npm run android
npm run ios
npm run web
npm run typecheck
```

### Probar desde un teléfono físico

`localhost` desde el teléfono apunta al propio teléfono, no al computador.

Para utilizar el backend desde Expo Go se debe configurar la IP local del PC:

```env
EXPO_PUBLIC_API_URL=http://192.168.X.X:3000
```

El computador y el dispositivo móvil deben poder comunicarse dentro de la misma red.

---

# Backend

## Ejecución local

```bash
cd backendclink
npm install
```

Crear:

```text
backendclink/.env
```

Ejemplo:

```env
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=campuslink

PORT=3000
NODE_ENV=development
```

Después:

```bash
npm run dev
```

El backend comprobará primero la conexión a MongoDB.

Si la conexión falla, el servidor no comienza a aceptar requests.

Con una conexión correcta:

```text
MongoDB connected to database "campuslink"
CampusLink API running on port 3000
```

---

# Backend con Docker

Desde:

```bash
cd backendclink
```

ejecutar:

```bash
docker compose up --build
```

Esto construye y ejecuta el backend como:

```text
campuslink-api
```

en:

```text
http://localhost:3000
```

Para detenerlo:

```bash
docker compose down
```

> El `docker-compose.yml` actual dockeriza el **backend**, no Supabase ni MongoDB. El contenedor utiliza la conexión MongoDB indicada mediante `MONGODB_URI`.

---

# Supabase

El esquema relacional se administra mediante migraciones dentro de:

```text
backendclink/supabase/migrations/
```

Para comprobar el estado de las migraciones:

```bash
cd backendclink
npx supabase migration list
```

La base remota y el repositorio deben mantener sincronizadas sus migraciones.

Las credenciales privadas o `service_role` nunca deben almacenarse en Git.

---

# MongoDB

La conexión se configura mediante:

```env
MONGODB_URI=
MONGODB_DB_NAME=campuslink
```

El backend mantiene una única configuración centralizada y realiza conexión fail-fast antes de iniciar Express.

La definición de colecciones, validadores e índices se encuentra en:

```text
backendclink/src/database/mongodb/001_create_collections.mongosh.js
```

---

# Desarrollo del frontend

La aplicación utiliza actualmente pantallas maestras para avanzar el diseño y la navegación antes de conectar todos los módulos reales.

Entre las vistas existentes se encuentran:

- Inicio.
- Marketplace.
- Biblioteca.
- Actividades.
- Detalle de contenido.
- Creación de actividades.
- Login.
- Registro.
- Recuperación de contraseña.
- Verificación.
- Mapa 3D.

Parte del contenido todavía utiliza datos almacenados en:

```text
frontendclink/src/mocks/
```

Por lo tanto, visualizar una funcionalidad en la interfaz **no significa necesariamente que su backend ya esté implementado**.

---

# Convenciones de desarrollo

Se busca mantener responsabilidades separadas entre:

```text
UI
↓
Lógica de aplicación
↓
Servicios / API
↓
Backend
↓
Persistencia
```

En el backend, los módulos implementados progresivamente siguen la separación:

```text
route
controller
service
repository
```

La lógica de negocio no debe quedar acoplada directamente a Express ni a una base de datos concreta.

El mapa 3D mantiene además su propia frontera dentro de `src/three` para evitar mezclar lógica de Three.js con el resto del dominio de CampusLink.

---

# Alcance y restricciones

CampusLink:

- No procesa pagos electrónicos.
- No garantiza acuerdos realizados fuera de la aplicación.
- No verifica físicamente los artículos intercambiados.
- No permite compartir material protegido por derechos de autor sin autorización.
- No realiza seguimiento GPS continuo de estudiantes.
- No reemplaza los canales oficiales de la institución.
- No contempla publicidad comercial pagada dentro de su alcance inicial.
- Utiliza React Native y Expo para compartir la mayor cantidad posible de código entre Android e iOS.

Cada usuario es responsable del contenido que publica y de los acuerdos que realiza con otros usuarios.

---

# Próximos pasos

El desarrollo continuará principalmente en:

1. Consolidar las pantallas maestras y navegación móvil.
2. Integrar autenticación real con Supabase.
3. Conectar perfiles, carreras, asignaturas y roles con PostgreSQL.
4. Implementar servicios y endpoints de recursos académicos.
5. Implementar marketplace, solicitudes y transacciones.
6. Implementar creación y participación real en actividades.
7. Representar actividades y puntos de interés sobre el mapa.
8. Implementar reputación y valoraciones.
9. Construir el sistema de recomendaciones.
10. Incorporar moderación, reportería y analítica.
11. Añadir pruebas de integración y validaciones de calidad.
12. Preparar estrategia de despliegue y distribución para la entrega final.

---

## Estado del proyecto

CampusLink ya dispone de una base técnica funcional compuesta por:

- Aplicación React Native / Expo.
- Navegación y pantallas maestras.
- Mapa 3D interactivo.
- API REST en Node.js y Express.
- Comunicación frontend → backend para el mapa.
- Persistencia documental MongoDB.
- Esquema relacional PostgreSQL/Supabase de 33 tablas.
- Migraciones versionadas.
- Backend preparado para ejecución mediante Docker.

El trabajo actual se concentra en transformar esta base y las maquetas de interfaz en **flujos completos conectados a datos reales y reglas de negocio**.
