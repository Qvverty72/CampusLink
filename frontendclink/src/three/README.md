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

`MapActivitiesPanel` muestra dos contadores circulares sobre el mapa, azul para
oficiales y naranja para comunitarias, en una columna a 16 puntos del borde
inferior/derecho del viewport (encima de la barra de navegación). Cada círculo de
64 puntos muestra el número centrado y su etiqueta de tipo debajo, y abre el listado del campus
en la vista general o del edificio seleccionado. El wrapper usa box-none para
conservar interacción con el mapa fuera de los botones. No hay recuadro grande
ni indicadores 3D. Se ocultan al abrir información del piso.
`ActivityTypeCounter` comparte conteo/estado/etiquetas accesibles entre la variante
mapa (anillo fino de 64 puntos con fondo blanco y borde/número del color del tipo)
y piso (anillo de 48 puntos, label y acción). La variante mapa usa la misma base
del anillo del piso y mantiene la presentación plana de la referencia visual.
Carga muestra spinner y error guion/reintento, sin simular cero; abrir durante carga
no duplica consulta. Los listados mantienen cinco tarjetas por página, filtro de
descripción comunitario y publicación del tipo autorizado. Desde ficha se puede
explorar su piso; cerrar conserva edificio y cambiar campus/edificio cierra la vista.
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
`LocationActivities` pagina las tarjetas con un máximo de cinco publicaciones en
total, incluso cuando aparecen ambos tipos. Conserva oficiales primero y el orden
de la consulta dentro de cada tipo. Los encabezados muestran los totales del filtro,
con controles Anterior/Siguiente y Página X de Y debajo de las tarjetas.
Cambiar página reinicia el scroll del modal mediante `onPageChange`; cambiar lugar,
tipo o actualizar por gesto vuelve a la primera página. Regresar de una ficha
conserva la página si sigue disponible; al reducir resultados se ajusta al último
número válido. La paginación es local: la consulta completa sigue alimentando los
contadores del mapa/piso y solo las tarjetas de la página montan sus consultas.
En el modal comunitario (`activityType=COMMUNITY_ACTIVITY`), «Filtrar por descripción»
abre un menú con Todas las descripciones y el catálogo compartido de siete opciones
de `ACTIVITY_DESCRIPTION_OPTIONS`. La coincidencia es exacta y se aplica antes de
paginar; Todas incluye texto libre e histórico. Seleccionar cierra el menú y vuelve
a página 1. La selección se conserva al actualizar/regresar de ficha y se reinicia
al cambiar lugar/tipo o sesión/campus. El encabezado cuenta coincidencias; los
contadores del mapa/piso conservan totales completos. Sin coincidencias, el menú
permanece disponible para cambiar el filtro. Oficiales/vista combinada conservan
su consulta. Menú inline con opciones radio/estado seleccionado y scroll del modal,
sin añadir otro ScrollView ni modificar los formularios.
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
La actualización manual se realiza arrastrando hacia abajo desde el inicio del
modal, con indicador de carga. En información del piso actualiza los contadores de
actividades vigentes; en Detalle de actividades actualiza el listado para mostrar
nuevas publicaciones, manteniendo ubicación y tipo seleccionados. En la ficha
actualiza su consulta individual, en lugar del botón Actualizar ficha.
`ActivityRefreshScrollView` conserva el scroll de piso, campus/edificio y notificaciones;
`useActivityRefresh` registra la consulta de la vista visible. El componente nulo
`ActivityRefreshRegistration` se monta únicamente en información del piso y en
listado/carga/error de `LocationActivities`, reutilizando `ActivitiesState.refresh`.
La ficha registra su propio callback; formularios y detalle de POI no montan el
registrador. No hay registros simultáneos de listado y ficha.
Usa `RefreshControl` en iOS/Android y eventos táctiles web con umbral de 64 px al
soltar, porque `RefreshControl` de React Native Web no implementa el gesto.
El control nativo permanece montado en todas las vistas; solo cambian `enabled`
y `refreshing`. Agregarlo/quitarlo cambia la jerarquía de `ScrollView` y remonta
el navegador, perdiendo la selección de actividad y los borradores.
No actualiza durante carga, inscripción/retiro, eliminación, edición, denuncia o
vista de serie. Al desmontar cada vista se limpia el registro; respuestas obsoletas
siguen cancelándose mediante el hook existente. Los errores permiten reintentar
con el mismo gesto, incluso si el contenido no alcanza para desplazar el modal.
En `ActivityDetail`, las descripciones de más de 240 caracteres Unicode se muestran
con un resumen de hasta cuatro líneas. «Ver más» despliega el texto completo y el
mismo botón cambia a «Ver menos» para contraerlo. El estado se reinicia al cambiar
la actividad o su descripción; el contenido guardado no se recorta.
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

En creación y edición, `ActivityFields` usa `allowCustomDescription` según
`identity.capabilities.officialActivities` del campus vigente. Quien puede publicar
eventos oficiales escribe descripción libre tanto en comunitarias como oficiales,
con campo multilinea obligatorio y límite de 2000 caracteres. Quien no tiene esa
capacidad elige una de siete descripciones fijas. Ambos formularios comprueban la
política con `isActivityDescriptionAllowed`, además de la validación de contenido.
El catálogo es política frontend; API conserva description string y sus límites.

`ActivityDateTimeField` abre el diálogo del sistema en Android y un modal con
ruedas y Aceptar/Cancelar en iOS. La variante `.web` abre un modal con selector del
navegador. Estos selectores bloquean la interacción con el formulario de fondo;
Cancelar/cerrar conserva el valor anterior y solo Aceptar aplica la elección. Inicio,
término y el límite de repetición usan estos selectores; las exclusiones de una
serie conservan su entrada por fechas separadas por comas. La referencia libre
del lugar se omite en creación y al editar actividades sin referencia previa.
La edición recibe `existingContent`: una descripción previa fuera del catálogo
puede conservarse como texto sin edición cuando falta capacidad oficial, o
sustituirse por una opción. Con capacidad oficial puede corregirse libremente.
Una referencia previa conserva su campo editable.
El editor permite cambiar edificio/piso/POI; `creationLocation` solo fija el
contexto espacial en creación. Las fechas no modificadas conservan segundos y
milisegundos, aunque el selector muestre precisión de minutos.

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
presenta «‹ Volver a la ficha» encima del título, alineado a la izquierda con el
mismo estilo de retorno de la ficha, y Guardar cambios al final del formulario.
En edición, `ActivityFields` activa `locationDropdowns` para edificio, piso y POI:
cada control muestra la selección actual y despliega una lista acotada bajo él,
con un solo menú abierto. Piso/POI se habilitan al tener padre válido; cambiar de
edificio limpia piso/POI y cambiar de piso limpia POI. Elegir el mismo valor solo
cierra el menú; el POI opcional mantiene «En el piso, sin punto de interés».
El retorno conserva su bloqueo durante el envío. El editor
abre al inicio del ScrollView del modal de piso o campus/edificio: ActivityDetail
notifica `onEditOpen` tras montar la vista de edición y LocationActivities reenvía
al contenedor su callback estable de scroll a y=0, sin animación. Completar campos
no reinicia el desplazamiento ni remonta el formulario. El editor
reutiliza `ActivityFields` con creación, conserva los segundos de fechas no
modificadas y permite guardar con una sola acción. Al pulsar Guardar valida el
borrador y obtiene automáticamente el hash del servidor antes del PATCH, sin
botón de revisión ni confirmación intermedia. Durante ambas solicitudes bloquea
los controles y evita doble envío; cancelar/desmontar aborta el flujo. Una ocurrencia puede
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

