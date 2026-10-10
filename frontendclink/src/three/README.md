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

## Creación de actividades en modales

`LocationActivities` ofrece crear actividad comunitaria al usuario institucional
verificado y publicar evento oficial cuando `identity.capabilities.officialActivities`
lo autoriza. USUARIO_AUTORIZADO necesita PUBLICAR_EVENTO del campus vigente;
ADMINISTRADOR conserva acceso automático aprobado. `CreateActivityForm` comparte
campos, muestra al creador como organizador, convierte fechas/horas locales a UTC
y publica por rutas separadas que fijan su tipo en el backend.

El adaptador `activityLocations` entrega edificios/pisos/POI por IDs de dominio
al formulario. No entrega meshes ni modifica la escena. Publicar refresca los
resúmenes del campus/edificio y abre el detalle con creador JOINED. Edificio y piso
obligatorios, POI visible del piso opcional. Cancelar o perder la respuesta tras
un commit no revierte la publicación; revisar listado antes de repetir.

## Series recurrentes

El mismo formulario comunitario/oficial ofrece repetir diariamente, semanalmente
o mensualmente, con intervalo, fecha final de los inicios y exclusiones. El backend
calcula la vista previa en la zona horaria del dispositivo; cambiar un campo exige
revisarla nuevamente. Cada fecha publicada tiene su ID de actividad y participación.
Las tarjetas y `ActivityDetail` distinguen ocurrencia/serie; `ActivitySeriesView`
permite elegir otra ocurrencia dentro del modal. Los resúmenes conservan los conteos
de ocurrencias vigentes por campus/edificio y no generan puntos en la escena.

## Edición de actividades

La ficha ofrece editar al creador cuando el backend entrega `editing`. El editor
reutiliza `ActivityFields` con creación, conserva los segundos de fechas no
modificadas y exige una vista previa antes de guardar. Una ocurrencia puede
editarse aunque esté en curso; una futura permite editar esta y las próximas sin
comenzar. Las fechas se trasladan en la zona guardada de la serie, conservando las
pasadas, IDs e inscripciones. La regla de creación permanece como referencia
histórica; el listado muestra las fechas reales editadas de cada ocurrencia.

Guardar refresca ficha y consulta compartida del campus, incluidos los resúmenes
por edificio. No modifica la selección, las geometrías ni los stores 3D.
La API conserva historial para F2.6-08; todavía no envía notificaciones.
Ese historial está embebido en `activities.changeHistory`; la definición original
de serie está en `seriesDefinition` de la primera ocurrencia. No se crean nuevas
colecciones MongoDB ni se cambia el contrato usado por los modales.

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

