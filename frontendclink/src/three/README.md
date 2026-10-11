# Capa 3D

Esta carpeta contiene escenas, componentes, modelos tipados y controles de cámara
para React Three Fiber.

## Integración de actividades

`features/activities` contiene el contrato, cliente autenticado, hook y componentes
nativos, incluidos `components/FloorInfoModal.tsx` y `components/MapActivitiesPanel.tsx`.
La pantalla Expo carga una consulta del campus y comparte el resultado por props con
el resumen y los modales nativos, sin duplicar actividades en `mapStore` o `mapDataStore`.
El hook cancela solicitudes obsoletas al cambiar sesión/campus y actualiza la consulta
al terminar la primera actividad. El navegador y el modal permiten actualizarla.

`MapActivitiesPanel` muestra sobre el mapa un resumen nativo con el total y los
conteos oficiales/comunitarios del campus en la vista general, o del edificio
seleccionado. El panel abre el modal de actividades, desde el cual se puede
explorar su piso. Los estados de carga/error se muestran sin conteos engañosos.
`FloorInfoModal` abre con descripción del piso, contadores circulares independientes
para eventos oficiales y actividades comunitarias y tarjetas de POI visibles. Cada
contador abre la consulta de ese tipo mediante `LocationActivities.activityType`;
volver a la información conserva el piso y cerrar conserva el edificio desplegado.
En pantallas estrechas los contadores pasan debajo de la descripción. Carga/error
no se representan como cero actividades y los POI ausentes tienen un estado vacío.
Las tarjetas POI muestran `PointOfInterestBanner`, un banner panorámico con la
primera imagen local registrada del POI (140 puntos de alto, ancho disponible,
cover). TouchableOpacity usa estilo estático compatible con NativeWind; la imagen
tiene ancho/alto explícitos que reemplazan sus dimensiones intrínsecas nativas.
Cada POI ocupa su fila sin expandirse, con scroll para listados extensos.
El nombre aparece en blanco sobre la esquina inferior izquierda, con contraste
suave y hasta dos líneas; la capa no bloquea el toque ni aumenta la altura.
Tipo/descripción quedan en el detalle; si no hay foto o falla su carga,
el banner conserva tamaño y muestra nombre/estado vacío. Son presionables: abren
`PointOfInterestDetail` dentro del mismo
modal con descripción, tipo y edificio/piso. Las imágenes se muestran únicamente
en el banner del listado, sin sección de imágenes en el detalle. El regreso conserva el
piso y la X conserva el edificio desplegado. El detalle resuelve el POI vigente
por `poiKey`, sin petición adicional ni copia persistente del documento.
`PointOfInterestDefinition.imageKeys` contiene nombres de archivo opcionales que
se resuelven mediante el registro generado por `npm run poi:images`. Instrucciones
y ejemplo Mongo en [poimages/README.md](../../assets/images/poimages/README.md).
Las tarjetas y fichas detalladas se muestran dentro de los modales.
Los contenedores mantienen una altura del 86% del espacio disponible y un ancho
máximo de 980 mientras cargan o cambian de vista; el contenido usa ScrollView.
`ActivityContentTransition` suaviza navegación y llegada de datos con opacidad y
un desplazamiento de 6 puntos durante 180 ms. Respeta reducir movimiento y cancela
animaciones anteriores; no retrasa consultas ni reutiliza datos anteriores.
La vista «Detalle de actividades» usa filas adaptables: título/tipo/inicio/término
y contador de inscritos a la izquierda y acciones de inscripción/retiro a la derecha;
en móvil los bloques se apilan. Descripción/organizador/estado/ubicación se consultan
en «Ver ficha completa», sin repetirlos en cada fila.
Crear actividad/publicar evento aparece al final, según tipo y capacidades.
`ActivityCard` reutiliza `useActivityDetail` para participación propia autorizada;
`ActivityParticipationControls` y `ActivityParticipantCount` se comparten con ficha.
El contador viene del detalle (`participantCount` opcional), nunca de cálculos cliente.
Después de retirarse se consulta de nuevo: un fallo no deshace el estado confirmado
ni se presenta como cero. No se añade ninguna colección ni caché de actividades.
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

En creación, `ActivityFields` permite elegir una de siete descripciones fijas y
`ActivityDateTimeField` abre el diálogo del sistema en Android y un modal con
ruedas y Aceptar/Cancelar en iOS. La variante `.web` abre un modal con selector del
navegador. Estos selectores bloquean la interacción con el formulario de fondo;
Cancelar/cerrar conserva el valor anterior y solo Aceptar aplica la elección. Inicio,
término y el límite de repetición usan estos selectores; las exclusiones de una
serie conservan su entrada por fechas separadas por comas. La referencia libre
del lugar se omite en creación. La edición mantiene descripción y referencia
existentes mediante los campos originales, para conservar contenido histórico.

El adaptador `activityLocations` entrega edificios/pisos/POI por IDs de dominio
al formulario. No entrega meshes ni modifica la escena. Publicar refresca los
resúmenes del campus/edificio y abre el detalle con creador JOINED. Edificio y piso
obligatorios, POI visible del piso opcional. Cancelar o perder la respuesta tras
un commit no revierte la publicación; revisar listado antes de repetir.

El edificio y piso recibidos en `initialLocation` desde el lugar explorado aparecen
como información fija. Desde campus o edificio sin piso, el usuario completa solo
los niveles faltantes. Un cambio de ubicación remonta el formulario y descarta el
borrador anterior; no se sustituyen IDs de dominio por nombres de meshes.

Los modales de piso y actividades se cierran mediante su X superior, sin botones
inferiores Volver al mapa. El formulario tampoco muestra Volver a las actividades.
Cerrar conserva la selección del mapa y desmonta el contenido del modal.

Durante creación, el enlace superior de `LocationActivities` indica Volver al
listado de actividades / eventos y desmonta el formulario conservando lugar/tipo.
Fuera de creación, `FloorInfoModal` ofrece regreso a información del piso mediante
`onBackToFloorInfo`; la elección del destino se realiza en el navegador interno.

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
F2.6-08 usa el historial y eventos embebidos para notificaciones in-app; la bandeja
se abre desde Mi perfil y reutiliza ActivityDetail en modal. No crea puntos 3D.
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

