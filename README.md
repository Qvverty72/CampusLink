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
│ Dominio relacional   │  │ Mapa y actividades   │
│ Usuarios             │  │ Edificios y pisos    │
│ Recursos             │  │ POIs                 │
│ Transacciones        │  │ Participaciones      │
│ Valoraciones         │  │                      │
│ Reportería           │  │                      │
└──────────────────────┘  └──────────────────────┘
```

El frontend no accede directamente a MongoDB. Los datos del mapa se solicitan mediante la API REST del backend.

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
npx expo start -c
```

### Probar desde un teléfono físico

`localhost` desde el teléfono apunta al propio teléfono, no al computador.

Para utilizar el backend desde Expo Go se debe configurar la IP local del PC:

```env
EXPO_PUBLIC_API_URL=http://192.168.X.X:3000
```

El computador y el dispositivo móvil deben poder comunicarse dentro de la misma red.

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