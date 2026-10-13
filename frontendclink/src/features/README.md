# Organización de funcionalidades del frontend

Los módulos de `src/features` siguen la organización de `activities`:

```text
features/<modulo>/
  api/
  components/
  hooks/
  types/
```

| Carpeta | Responsabilidad | Ejemplos |
| --- | --- | --- |
| `api` | Transporte HTTP, validación de respuestas y clientes de servicios externos. | `activitiesApi.ts`, `sessionApi.ts`, `supabaseClient.ts`, `profileApi.ts` |
| `components` | Presentación, composición de pantallas, providers y estilos de interfaz. | `ActivityDetail.tsx`, `AuthProvider.tsx`, `ProfileScreen.tsx`, `form.styles.ts` |
| `hooks` | Estado React, efectos, carga y mutaciones, cancelación de solicitudes y coordinación con la sesión. | `useActivityDetail.ts`, `useAuth.ts`, `useAuthSession.ts`, `useAcademicProfile.ts` |
| `types` | Contratos de datos, tipos, constantes y funciones puras del dominio compartidas por el módulo. | `activity.ts`, `auth.ts`, `registration.ts`, `access.ts` |

Crear cada carpeta cuando contenga código real. Los módulos aún sin implementar no necesitan carpetas vacías. Evitar archivos de implementación sueltos en la raíz de un módulo y tipos compartidos declarados dentro de su API.

`app/` define las rutas y sus layouts de navegación. Las rutas de autenticación y cuenta exportan las pantallas de `features/auth/components` y `features/users/components`. Los layouts conservan los guards de navegación.

Usar rutas relativas entre carpetas del mismo módulo e imports `@/features/<modulo>/<carpeta>/<archivo>` desde otros módulos. Actualizar todos los consumidores al mover un archivo; evitar archivos puente que mantengan rutas antiguas.

Las APIs no dependen de componentes ni hooks. Los hooks consumen APIs y tipos; los componentes consumen hooks y tipos. `useAuth` expone el contexto compartido; `AuthProvider` monta `useAuthSession`. El cliente Supabase es un singleton de `auth/api` reutilizado por el transporte autenticado común de `src/lib/api`.

La autorización de negocio permanece en el backend. Esta estructura organiza el frontend sin trasladar reglas del servidor a la interfaz. El backend mantiene sus capas de routes/controllers/services/repositories/types; no usa la distribución de carpetas de React.

Después de reorganizar archivos, ejecutar `npm.cmd run typecheck` desde `frontendclink` en PowerShell y verificar el empaquetado de Expo.
