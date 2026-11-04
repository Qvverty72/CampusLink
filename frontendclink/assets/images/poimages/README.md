# Imágenes de puntos de interés

Esta carpeta contiene las 17 fotografías finales de los POI aportadas por el
usuario el 2026-10-20 y dos placeholders históricos de Sala de reuniones. Coloca
las fotos PNG, JPG/JPEG o WebP directamente aquí y usa nombres estables. Los POI
sin referencias a imágenes registradas muestran un estado vacío.

## Fotografías finales

Las fotos proceden de `C:/Users/qwert/Desktop/Nuevo modelo final/Fotos POI`.
Los originales se conservan intactos; la app utiliza derivados JPEG de calidad 88,
con un máximo de 1600 píxeles en el lado mayor y proporción original. El manifiesto
vigente [inventory-photos.json](./inventory-photos.json) registra la correspondencia
entre originales, POI y archivos finales, dimensiones, tamaños y hashes.

Quince fotos sustituyen los placeholders de H, E, F, Cabaña 3 y Gimnasio conservando
sus nombres de archivo e `imageKeys`. Se añaden estas dos claves:

- `ebuilding-floor1-enfermeria.jpg`: Enfermería, Edificio E, Piso 1.
- `fbuilding-floor1-patio-de-comidas.jpg`: Patio de comidas, Edificio F, Piso 1.

Ambos pisos fueron confirmados por el usuario. Los nombres históricos
`cabin03-floor2-*.jpg` y `cabin03-floor3-*.jpg` se conservan como claves estables;
no indican el nivel actual de esos POI después de reorganizar las cabañas. La
ubicación actual procede del edificio y piso padre en el mapa, no del archivo.

## Asociación en Mongo

En el POI existente de `campus_maps → buildings → floors → pois`, añade el campo
opcional `imageKeys` con nombres exactos de archivo, incluida la extensión:

```json
{
  "poiKey": "ebuilding-floor1-enfermeria",
  "description": "Enfermería. Edificio E, Piso 1.",
  "imageKeys": ["ebuilding-floor1-enfermeria.jpg"]
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

La API devuelve la jerarquía anidada del mapa; el frontend conserva `imageKeys`
opcional y lo resuelve contra el registro. Las imágenes utilizan los POI de la
colección existente `campus_maps`, sin endpoints ni colecciones adicionales. Si un
validador rechaza un campo, inspecciónalo antes de cambiarlo; no ejecutes el
bootstrap histórico, cuyo modelo de POI difiere del actual.

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

Para diagnosticar un banner vacío, regenera el registro y reinicia Expo con caché
limpia (`npm run poi:images` y `npx expo start --clear`); después recarga completamente
la app. Comprueba los `imageKeys` de la respuesta del mapa, no solo el inventario:
deben coincidir exactamente con nombres del registro. El gesto de refresh del piso
actualiza actividades, pero no vuelve a consultar el mapa ni sus fotos. Si el banner
sigue vacío, revisa errores de carga de assets y sus dimensiones en el inspector;
un registro correcto no garantiza que el servidor/bundle entregue la imagen.

## Inventario del mapa

El [script de inventario Mongo](../../../../backendclink/src/database/mongodb/004_campus_poi_inventory.mongosh.js)
incluye los 17 POI y sus `imageKeys`. Se ejecuta en mongosh o Compass sobre la base
existente, con vista previa por defecto. Revisa el campus de destino mediante
`POI_INVENTORY_CAMPUS_ID` y el plan antes de escribir; solo aplica al establecer
`globalThis.POI_INVENTORY_APPLY = true` y volver a cargar el script. Conserva los
POI de pisos «Nada» como inactivos. La ejecución del generador de imágenes no aplica
este inventario a Mongo. Tras una aplicación, recarga completamente la app.
La clasificación de POI habilitados como ubicación de actividades y las
coordenadas individuales precisas siguen pendientes.

## Placeholders históricos

[inventory-placeholders.json](./inventory-placeholders.json) conserva el inventario
histórico del 2026-10-10: nombres y prompts de las 15 ilustraciones sustituidas por
fotografías. Sus datos de generación (JPEG calidad 90, 1448 × 1086) describen esos
placeholders anteriores; para los archivos actuales consulta `inventory-photos.json`.

Estos dos archivos de demostración se mantienen registrados para el POI histórico
inactivo Sala de reuniones de Cabaña 1; no forman parte de las 17 fotografías reales:

- `cabin01-sala-reuniones.jpg`: exterior ilustrativo de una cabaña universitaria.
- `cabin01-sala-reuniones-interior.jpg`: interior ilustrativo de sala de reuniones.

Generados con la herramienta integrada imagegen, convertidos a JPEG de calidad 90
para conservar sus claves históricas. Cada imagen mide 1448 × 1086
(4:3). Son demostraciones, no fotografías del campus real. El registro contiene
ambos archivos; conservarlos no reactiva el POI.

Prompts usados:

**Exterior:** Use case: stylized-concept. Asset type: temporary placeholder image for the CampusLink point-of-interest gallery. Create ONE standalone landscape 4:3 raster illustration of the exterior of a modest university cabin containing a meeting room, simple welcoming architecture, teal accents and muted neutral colors, daylight, clean polished soft 3D illustration, no people, no university logos, no real identifiable campus. Prominent small readable label near the bottom with exactly the Spanish text 'Imagen de ejemplo'. This must visibly be illustrative demo content rather than an actual photograph. Full opaque background, single scene, no collage, no frame or app UI. Keep important subject in the central area.

**Interior:** Use case: stylized-concept. Asset type: temporary placeholder image for the CampusLink point-of-interest gallery. Create ONE standalone landscape 4:3 raster illustration of an interior university meeting room, table with several chairs and a whiteboard, daylight through a window, teal accents with warm wood and muted neutral colors, clean polished soft 3D illustration, no people, no university logos, no real identifiable campus. Prominent small readable label near the bottom with exactly the Spanish text 'Imagen de ejemplo'. This must visibly be illustrative demo content rather than an actual photograph. Full opaque background, single scene, no collage, no frame or app UI. Keep important subject in the central area.
