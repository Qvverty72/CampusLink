# CampusLink

Repositorio con frontend y backend separados:

- `frontendclink`: aplicación móvil con Expo, React Native y Expo Router.
- `backendclink`: API con Node.js, TypeScript, Express y PostgreSQL/Supabase.

Cada proyecto administra sus propias dependencias y variables de entorno.

El frontend conserva las versiones verificadas en el MVP, especialmente para la
compatibilidad entre Expo SDK 57, React 19 y el stack 3D. No se debe añadir
`r3f-native-orbitcontrols`; los controles de cámara serán propios.
