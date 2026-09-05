# CampusLink

Plataforma móvil para conectar a la comunidad estudiantil mediante el intercambio de recursos académicos, un marketplace entre estudiantes y un mapa 3D de actividades dentro del campus.


## El problema

Los estudiantes suelen tener dificultades para encontrar material de estudio relevante, reutilizar recursos académicos y descubrir actividades que ocurren dentro de su institución. La información está dispersa, los recursos dejan de utilizarse y no siempre existe un canal confiable para conectar a estudiantes de distintos niveles.

## La propuesta

CampusLink centraliza tres experiencias principales:

- **Recursos académicos:** publicación y búsqueda de apuntes, resúmenes y guías creadas por los propios estudiantes, organizadas por carrera y asignatura.
- **Marketplace estudiantil:** intercambio de libros, calculadoras, guías impresas, materiales de laboratorio, uniformes y otros recursos mediante venta, préstamo o donación.
- **Mapa y comunidad:** visualización de edificios, actividades y puntos de interés mediante un mapa 3D interactivo del campus.

La plataforma busca facilitar que estudiantes de años superiores compartan recursos útiles con quienes recién ingresan, fomentar la reutilización y mejorar el acceso a información relevante para la vida académica.

## Funcionalidades

### Usuarios

- Registro e inicio de sesión.
- Perfiles asociados a carrera y asignaturas.
- Roles para estudiantes, dirigentes y administradores.
- Verificación en dos pasos para publicar recursos.
- Reputación basada en transacciones e interacciones completadas.

### Recursos y marketplace

- Publicación de material digital original creado por estudiantes.
- Publicación de recursos físicos para venta o donación.
- Clasificación por carrera, asignatura, tipo de recurso y modalidad.
- Búsqueda y filtrado de publicaciones.
- Solicitudes, reservas y confirmación de entrega.
- Calificación de la experiencia entre participantes.

### Recomendaciones de recursos

- Sugerencias según carrera y asignaturas cursadas.
- Priorización según relevancia, reputación e historial de interacción.

### Mapa y actividades

- Exploración del campus mediante un modelo 3D en formato GLB.
- Selección de edificios y visualización interactiva de sus pisos.
- Creación de grupos de estudio, talleres y actividades deportivas.
- Consulta de ubicación, fecha, horario y descripción de cada actividad.
- Participación de estudiantes en eventos.
- Publicación de eventos y puntos oficiales por usuarios autorizados.

### Administración y analítica

- Indicadores de usuarios, publicaciones y transacciones.
- Recursos y asignaturas con mayor demanda.
- Estadísticas de participación en actividades.
- Moderación de contenido reportado.
- Reportes para apoyar la evolución de la plataforma.

## Estado de implementación

| Módulo | Estado |
|---|---|
| Pantalla de bienvenida y navegación | En funcionamiento |
| Mapa 3D del campus | MVP funcional |
| Selección de edificios y pisos | MVP funcional |
| API REST y endpoint de salud | Base funcional |
| Autenticación y perfiles | Planificado |
| Marketplace y transacciones | En diseño |
| Actividades sobre el mapa | Planificado |
| Recomendaciones | Planificado |
| Analítica y reportería | Planificado |

## Arquitectura

```text
┌─────────────────────────────────────┐
│ Aplicación móvil                    │
│ React Native + Expo + Expo Router   │
│                                     │
│ Usuario · Mapa 3D · Marketplace     │
└──────────────────┬──────────────────┘
                   │ API REST
┌──────────────────▼──────────────────┐
│ Backend                             │
│ Node.js + Express + TypeScript      │
│ Autenticación · Negocio · Reportes  │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│ Persistencia                        │
│ Supabase / PostgreSQL               │
│ MongoDB para actividades del mapa   │
└─────────────────────────────────────┘
```

### Organización del repositorio

```text
CampusLink/
├── frontendclink/
│   ├── app/
│   │   ├── (user)/          # Bienvenida, autenticación y perfil
│   │   ├── (map)/           # Mapa y ubicaciones del campus
│   │   └── (marketplace)/   # Publicaciones y transacciones
│   ├── assets/models/       # Modelo 3D del campus
│   └── src/
│       ├── components/map/  # Escena y controles 3D
│       ├── data/            # Configuración temporal de edificios
│       ├── models/          # Carga y tipado del GLB
│       ├── store/           # Estado global con Zustand
│       └── types/           # Tipos compartidos del frontend
├── backendclink/
│   ├── src/config/          # Configuración y variables de entorno
│   ├── src/routes/          # Rutas de la API
│   ├── src/app.ts           # Configuración de Express
│   ├── src/server.ts        # Inicio del servidor
│   └── Dockerfile
└── README.md
```

## Tecnologías

### Frontend

| Tecnología | Uso |
|---|---|
| TypeScript | Tipado estático y mantenibilidad |
| React Native | Interfaz móvil multiplataforma |
| Expo | Entorno de desarrollo y distribución |
| Expo Router | Navegación basada en archivos |
| NativeWind / Tailwind CSS | Sistema de estilos |
| Zustand | Estado global |
| React Three Fiber | Renderizado 3D declarativo |
| Drei | Utilidades para Three.js y carga de modelos |
| gltf.pmnd.rs / gltfjsx | Optimización y generación de componentes desde GLTF/GLB |

### Modelado 3D

El campus se modela en **Blender** y se exporta en formato **GLB**. Cada edificio y piso utiliza nombres identificables para permitir selección, animaciones y asociación con información de la plataforma.

### Backend

| Tecnología | Uso |
|---|---|
| TypeScript | Tipado de servicios y reglas de negocio |
| Node.js | Entorno de ejecución |
| Express | API REST |
| Docker | Construcción y ejecución reproducible |

### Base de datos

La integración actual está preparada para **Supabase**, utilizando **PostgreSQL** como base relacional. **MongoDB** usará para todo lo que tenga que ver con el mapa y sus actividades.

## Requisitos

- Node.js 22 o superior.
- npm.
- Expo Go o un emulador Android/iOS para probar la aplicación.
- Docker, opcional, para ejecutar el backend en un contenedor.
- Un proyecto de Supabase para utilizar persistencia y autenticación reales.

## Instalación

Clona el repositorio y entra en su directorio:

```bash
git clone <URL_DEL_REPOSITORIO>
cd "Code CampusLink"
```

### Frontend

```bash
cd frontendclink
npm install
cp .env.example .env
npm run start
```

Desde la consola de Expo puedes abrir el proyecto en Expo Go, Android, iOS o web. También están disponibles estos comandos:

```bash
npm run android
npm run ios
npm run web
npm run typecheck
```

### Backend

En otra terminal:

```bash
cd backendclink
npm install
cp .env.example .env
npm run dev
```

La API se inicia por defecto en `http://localhost:3000`. Puedes comprobarla mediante:

```http
GET http://localhost:3000/api/v1/health
```

Respuesta esperada:

```json
{
  "status": "ok"
}
```

### Backend con Docker

Desde la raíz del repositorio:

```bash
docker build -t campuslink-api ./backendclink
docker run --env-file ./backendclink/.env -p 3000:3000 campuslink-api
```

## Variables de entorno

### Frontend — `frontendclink/.env`

```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

### Backend — `backendclink/.env`

```env
PORT=3000
NODE_ENV=development
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

No deben subirse credenciales reales al repositorio. Las claves de servicio de Supabase solo deben utilizarse en el backend.

## Alcance y responsabilidades

CampusLink facilita el contacto y registra el flujo de intercambio, pero:

- No procesa pagos electrónicos dentro de la plataforma.
- No verifica físicamente el estado, calidad o disponibilidad de los recursos.
- No garantiza acuerdos realizados fuera de la aplicación.
- No permite publicar material de terceros protegido por derechos de autor sin autorización.
- No realiza seguimiento GPS continuo de los estudiantes.
- No reemplaza los canales oficiales de comunicación de la institución.
- No incorpora publicidad comercial pagada en su alcance inicial.
- No requiere desarrollo nativo específico para cada sistema operativo durante la primera versión; se utiliza Expo y React Native.

Cada usuario es responsable del contenido que publica y de comprobar que posee los derechos necesarios para compartirlo.

## Hoja de ruta

1. Consolidar navegación, diseño visual y mapa 3D.
2. Implementar autenticación, perfiles, roles y verificación en dos pasos.
3. Diseñar el modelo de datos definitivo en Supabase/PostgreSQL.
4. Construir publicaciones, búsqueda y filtros del marketplace.
5. Implementar solicitudes, reservas, confirmaciones y reputación.
6. Incorporar actividades y puntos de interés al mapa.
7. Añadir recomendaciones basadas en reglas e historial de interacción.
8. Desarrollar moderación, analítica y reportería administrativa.

---

**CampusLink** busca que los recursos, espacios y oportunidades de la comunidad estudiantil sean más fáciles de descubrir, compartir y reutilizar.
