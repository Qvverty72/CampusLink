# Imágenes de puntos de interés

Coloca aquí fotos PNG, JPG/JPEG o WebP, directamente en esta carpeta. Usa nombres
estables, por ejemplo `cabin01-sala-reuniones.jpg`. Incluye dos placeholders de
demostración, identificados con el texto Imagen de ejemplo. Los POI sin referencias
a imágenes registradas muestran un estado vacío.

## Asociación en Mongo

En el POI existente de `campus_maps → buildings → floors → pois`, añade el campo
opcional `imageKeys` con nombres exactos de archivo, incluida la extensión:

```json
{
  "poiKey": "cabin01-floor1-sala-reuniones",
  "description": "Espacio para reuniones en la Cabaña 1.",
  "imageKeys": ["cabin01-sala-reuniones.jpg", "cabin01-sala-reuniones-interior.jpg"]
}
```

Este es un fragmento del POI, no un documento de reemplazo. Conserva `name`, `type`,
`position`, `isVisible`, `isFixed` y los demás campos existentes. Se respeta el orden
de `imageKeys`. No almacenes rutas Windows, `require(...)`, binarios ni Base64.
La descripción del documento alimenta Información del lugar: puedes incluir allí
datos útiles reales como el uso del espacio y sus indicaciones.

## Registro en la app

Desde `frontendclink`, ejecuta:

```sh
npm run poi:images
```

El comando genera `src/three/assets/poiImages.generated.ts` con `require` literales
compatibles con Metro. No edites ese archivo a mano. También se ejecuta antes de
`npm start`, `npm run android`, `npm run ios` y `npm run web`. Si agregas fotos con
Expo abierto o exportas mediante `npx expo export`, ejecútalo explícitamente antes.

Los nombres distinguen mayúsculas/minúsculas. Las variantes `@2x` / `@3x` se resuelven
por Metro a partir del archivo base; usa el nombre base en Mongo. Las subcarpetas no
se registran. Referencias desconocidas se omiten sin romper la ficha y errores de
decodificación muestran un mensaje en el espacio de la foto.

La API ya devuelve la jerarquía anidada del mapa; el frontend conserva `imageKeys`
opcional y lo resuelve contra el registro. No se crearon endpoints o colecciones ni
se escribieron datos en Mongo. El validador real de la colección no fue inspeccionado:
si rechaza el campo, revisa ese validador antes de cambiarlo; no ejecutes el bootstrap
histórico, cuyo modelo de POI difiere del actual.

En Información del piso, cada POI muestra su primera imagen registrada como banner
presionable (altura fija 140 puntos, ancho disponible, recorte cover). Cada POI
conserva su altura aunque cambie el tamaño de la foto o haya varios en el piso.
El nombre del POI recibido de Mongo aparece en blanco en la esquina inferior
izquierda del banner; no necesitas añadir texto a la imagen.
Coloca primero en `imageKeys` la foto
que quieras usar como portada. El modal de detalle del POI muestra información
del lugar y ubicación, sin sección de imágenes. Los archivos y las claves restantes
se conservan; imágenes ausentes o con errores no impiden abrir el detalle.

## Actualización

Después de editar en Compass, recarga completamente la app para descartar el mapa
en memoria. Las fotos locales forman parte de la distribución de la app: agregar
una nueva requiere regenerar el registro y distribuir una versión/actualización
con ese archivo. Cambiar solo Mongo no descarga fotos nuevas. Para administrar
imágenes sin distribuir assets se necesitaría almacenamiento remoto y URLs; eso
queda fuera de esta implementación.

## Placeholders incluidos

- Inventario de 2026-10-10: 15 placeholders adicionales, uno por cada POI de H,
  E, F, Cabaña 3 y Gimnasio. Nombres exactos y prompts completos en
  [inventory-placeholders.json](./inventory-placeholders.json), generados con
  imagegen integrado, JPEG calidad 90, 1448 × 1086. Son escenas de ejemplo,
  no fotografías del campus. Las imágenes anteriores se conservan.
- [Script e instrucciones de Mongo](../../../../backendclink/src/database/mongodb/004_campus_poi_inventory.README.md)
  para insertar en los pisos existentes y desactivar POI en pisos «Nada».
  Tras aplicarlo, recarga completamente la app. La clasificación de POI
  habilitados como ubicación de actividades queda pendiente.

- `cabin01-sala-reuniones.jpg`: exterior ilustrativo de una cabaña universitaria.
- `cabin01-sala-reuniones-interior.jpg`: interior ilustrativo de sala de reuniones.

Generados con la herramienta integrada imagegen, convertidos a JPEG de calidad 90
para coincidir con los nombres del ejemplo Mongo. Cada imagen mide 1448 × 1086
(4:3). Son demostraciones, no fotografías del campus real. El registro contiene
ambos archivos; no se modificó Mongo durante la generación.

Prompts usados:

**Exterior:** Use case: stylized-concept. Asset type: temporary placeholder image for the CampusLink point-of-interest gallery. Create ONE standalone landscape 4:3 raster illustration of the exterior of a modest university cabin containing a meeting room, simple welcoming architecture, teal accents and muted neutral colors, daylight, clean polished soft 3D illustration, no people, no university logos, no real identifiable campus. Prominent small readable label near the bottom with exactly the Spanish text 'Imagen de ejemplo'. This must visibly be illustrative demo content rather than an actual photograph. Full opaque background, single scene, no collage, no frame or app UI. Keep important subject in the central area.

**Interior:** Use case: stylized-concept. Asset type: temporary placeholder image for the CampusLink point-of-interest gallery. Create ONE standalone landscape 4:3 raster illustration of an interior university meeting room, table with several chairs and a whiteboard, daylight through a window, teal accents with warm wood and muted neutral colors, clean polished soft 3D illustration, no people, no university logos, no real identifiable campus. Prominent small readable label near the bottom with exactly the Spanish text 'Imagen de ejemplo'. This must visibly be illustrative demo content rather than an actual photograph. Full opaque background, single scene, no collage, no frame or app UI. Keep important subject in the central area.
