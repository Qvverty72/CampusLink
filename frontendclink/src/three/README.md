# Capa 3D

Esta carpeta contiene escenas, componentes, modelos tipados y controles de cámara
para React Three Fiber.

## Integración de actividades

`features/activities` contiene el contrato, cliente autenticado, hook y tarjetas nativas.
La pantalla Expo carga una consulta del campus y comparte el resultado por props con
el resumen y los modales nativos, sin duplicar actividades en `mapStore` o `mapDataStore`.
El hook cancela solicitudes obsoletas al cambiar sesión/campus y actualiza la consulta
al terminar la primera actividad. El navegador y el modal permiten actualizarla.

`MapActivitiesPanel` muestra sobre el mapa un resumen nativo con el total y los
conteos oficiales/comunitarios del campus en la vista general, o del edificio
seleccionado. El panel abre el modal de actividades, desde el cual se puede
explorar su piso. Los estados de carga/error se muestran sin conteos engañosos.
`FloorInfoModal` presenta las
actividades del piso en secciones independientes para oficiales y comunitarias.
Las tarjetas y fichas detalladas se muestran dentro de los modales.
`ActivityDetail` consulta la ficha por ID, muestra organizador y participación propia
y permite inscribirse. «Volver a las actividades» conserva la selección del mapa.
El hook cancela consultas obsoletas y revalida al vencer la actividad; cerrar el
modal desmonta la ficha. La inscripción usa `activity_participation` con JOINED/LEFT.
Las actividades nunca se representan como puntos, marcadores ni
geometría en el mapa 3D; `CampusMap` y `CampusModelScene` no reciben esos datos.

Las actividades referencian `building.id` y `floor.id`, con `poiKey` opcional.
La selección por raycast conserva `meshName`: la integración resuelve ese nombre
contra `floorData` y usa `floor.id` para filtrar actividades. Que ambos nombres
coincidan en el mapa actual no significa que sean el mismo contrato.

## Compatibilidad del MVP

- Expo SDK 57
- React 19.2.3
- React Native 0.86.3
- Three.js 0.185.x
- `@react-three/fiber` 9.7.x
- `@react-three/drei` 10.7.x
- `expo-gl`, `expo-asset` y `expo-file-system` 57.x

No instalar `r3f-native-orbitcontrols`: es incompatible con React 19 y React
Compiler en Expo SDK 57. Los controles de cámara deben implementarse dentro de
`controls/`.

