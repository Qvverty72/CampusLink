# Capa 3D

Esta carpeta contiene escenas, componentes, modelos tipados y controles de cámara
para React Three Fiber.

## Modelo actualizado de las cabañas

`assets/models/modelomejoradojunto.glb` incorpora cuatro niveles por cabaña:
Piso 1 y subterráneos -1, -2 y -3. La ruta activa sigue recibiendo sus metadatos
desde la API/MongoDB; `data/floors.ts` conserva la maqueta histórica y no se usa.
Los IDs y `meshName` de los pisos existentes permanecen estables aunque sus niveles
o nombres visibles cambien. El GLB llama `cabina` a la cabaña A (`cabin03`),
`cabinb` a B (`cabin02`) y `cabinc` a C (`cabin01`); los nombres de submesh
continúan usando `cabin01/02/03`. No inferir ubicación a partir del sufijo del ID.

`components/CampusModel.tsx` clona la escena del GLB y retira de esa copia solo los
submeshes que reconstruye como pisos interactivos. Así conserva transformaciones,
materiales, terreno, pasarela y árboles nuevos sin duplicar los pisos durante la
separación ni alterar la caché de `useGLTF`. Los hijos geométricos de los grupos de
piso de este GLB tienen transforms identidad; su transform raíz proviene del mapa.
Las mallas se identifican mediante `isMesh`, sin `instanceof THREE.Mesh`: Metro
puede resolver Three ESM para la escena y CJS para el loader de `three-stdlib`.
Solo se retiran de la decoración las mallas efectivamente reconstruidas como pisos.
La regresión se comprueba con `node --test tests/campus-model.test.mjs` desde
`frontendclink`, usando ambos módulos Three y el GLB real.
La animación ordena por `FloorMeshConfig.position[1]`, independientemente del orden
de la respuesta y de `level`. La elevación de las cabañas usa su rango de alturas
más un margen de 0.02 para descubrir también el -3 sobre la pasarela. Al cerrar,
todos los grupos regresan exactamente a su posición original.

El nodo `pine_tree13(easteregg)` se conserva como decoración sin `isFloor`, eventos
ni mecánica activada. Su punto de entrada futuro es la copia de la escena en
`CampusModelScene`: resolver allí `decoration.getObjectByName('pine_tree13(easteregg)')`
y diseñar su interacción en una tarea posterior. No reutilizar `isFloor` para ese
árbol, pues `CameraController` lo interpreta como selección de edificio/piso.

## Integración de actividades

`features/activities` contiene el contrato, cliente autenticado, hook y componentes
nativos, incluidos `components/FloorInfoModal.tsx` y `components/MapActivitiesPanel.tsx`.
La pantalla Expo carga una consulta del campus y comparte el resultado por props con
el resumen y los modales nativos, sin duplicar actividades en `mapStore` o `mapDataStore`.
El hook cancela solicitudes obsoletas al cambiar sesión/campus y conserva internamente
la respuesta completa autorizada. `selectActivityOccurrences` proyecta una tarjeta por
serie: la primera aún no terminada por inicio real (en curso o próxima), antes de filtrar
ubicación. El temporizador sustituye la tarjeta al terminar y revalida en segundo plano
sin vaciar el listado; volver a primer plano recalcula/revalida. Un error de red en esta
revalidación conserva la última respuesta; errores de autorización sí la retiran.
El navegador y el modal permiten actualizar manualmente con carga/error habituales.

`MapActivitiesPanel` muestra dos contadores circulares sobre el mapa, azul para
oficiales y naranja para comunitarias, en una columna con eventos oficiales arriba
y actividades comunitarias abajo, a 16 puntos del borde
inferior/derecho del viewport (encima de la barra de navegación). Cada círculo de
48 puntos muestra un icono Lucide de calendario/personas de 31,68 puntos visuales y el conteo en una insignia
superior derecha, sin etiquetas visibles. Abre el listado del campus
en la vista general o del edificio seleccionado. El wrapper usa box-none para
conservar interacción con el mapa fuera de los botones. No hay recuadro grande
ni indicadores 3D. Se ocultan al abrir información del piso.
El modal del mapa reserva una cabecera de 32 puntos solo para la X de cierre;
el tipo y su contador se muestran en el contenido de `LocationActivities`, sin
repetir título ni subtítulo de campus/edificio encima del listado.
`ActivityTypeCounter` comparte conteo/estado/etiquetas accesibles entre la variante
mapa (círculo translúcido, borde por tipo de 1 punto y sombra suave)
y piso (anillo de 48 puntos, label y acción). En el mapa solo aparecen el dibujo
centrado y la insignia. `ActivityTypeIcon` usa `CalendarDays`/`UsersRound` de
`lucide-react-native`, con `react-native-svg` ya instalado para navegación.
`MAP_ICON_SIZE` (36) y la escala de `styles.mapIcon` (0.88) controlan su tamaño;
`strokeWidth` (1.7) controla el grosor. La insignia de conteo usa también `GlassSurface`,
con borde y número por tipo,
altura de 24 puntos y ancho adaptable hasta 52; conteos largos ajustan fuente al ancho.
Cada botón ocupa 64 puntos de ancho, con separación de 8 entre botones.
La insignia se eleva 14 puntos y el padding superior del botón la mantiene dentro del área pulsable.
Icono/insignia son decorativos para
lectores de pantalla; el botón conserva su label accesible completo y estado de carga.
Los círculos del mapa y `BuildingCloseButton` («Volver atrás») usan
`components/GlassSurface.tsx`, el mismo material del navbar: blur35 y la opacidad
blanca de `GLASS_MATERIAL.surfaceTint` (actualmente0.80 ajustada por usuario).
Las insignias quedan fuera del recorte y por encima de la elevación del círculo.
El retorno mantiene bottom128/centrado y usa texto PRIMARY sobre la superficie clara.
La variante piso conserva anillo/número y textos. [Guía del material](../components/README.md).
Los enlaces, botones, selecciones e indicadores de los modales de actividades/piso
usan `APP_COLORS.PRIMARY` (`#002E56`) desde `@/types/colors`.
La [paleta compartida](../types/README.md) está disponible para todos los módulos.
`ACTIVITY_COLORS` en `features/activities/types/activity.ts` asocia `OFFICIAL_EVENT`
con `APP_COLORS.SECONDARY` y `COMMUNITY_ACTIVITY` con `APP_COLORS.ACCENT`.
Carga muestra spinner y error guion/reintento, sin simular cero; abrir durante carga
no duplica consulta. Los listados mantienen cinco tarjetas por página. El paginador
solo aparece desde seis resultados vigentes del filtro actual, con flechas Lucide,
números/selección circular y elipsis responsivas (`components/Pagination.tsx`).
Mantienen filtro de descripción comunitario y publicación del tipo autorizado. Desde ficha se puede
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
El inventario incluye 17 fotografías reales (2026-10-20), con Enfermería en E1 y
Patio de comidas en F1; se conservan las claves históricas de imágenes y POI.
Las tarjetas y fichas detalladas se muestran dentro de los modales.
Los contenedores mantienen una altura del 86% del espacio disponible y un ancho
máximo de 980 mientras cargan o cambian de vista; el contenido usa ScrollView.
`ActivityContentTransition` suaviza navegación y llegada de datos con opacidad y
un desplazamiento de 6 puntos durante 180 ms. Respeta reducir movimiento y cancela
animaciones anteriores; no retrasa consultas ni reutiliza datos anteriores.
Durante la carga del listado, `LocationActivities` muestra `ActivityListSkeleton`
con dos filas neutrales adaptables y un placeholder de filtro en comunitarias.
La base universal vive en `components/Skeleton.tsx`: `Skeleton` agrupa placeholders
con `label`, `style` y `contentStyle`; `SkeletonBlock` admite `width`, `height`,
`borderRadius` y `style` para líneas, círculos o rectángulos en cualquier módulo.
Comparte color neutral y una pulsación por grupo, respeta reducir movimiento y
se cancela al desmontar; lectores de pantalla reciben un único estado de carga.
Los layouts específicos solo componen bloques, sin duplicar el motor. No monta tarjetas ni
consultas de detalle hasta recibir resultados. Se comparte entre mapa y piso.
`ActivityDetailSkeleton` anticipa cabecera, fechas, siete filas y acción de la ficha;
`ActivityParticipants` usa la misma base para siete filas durante carga/cambio de
página. Reemplazan los spinners/textos visibles de ficha e inscritos, manteniendo
regreso/cierre, error/reintento y paginador cuando llegan datos. No cambia otros
spinners ni migra formularios o módulos ajenos automáticamente.
La vista «Detalle de actividades» muestra título/descripción/inicio/término y contador
de inscritos en tarjetas de ancho disponible. `ActivityDescription` comparte la
presentación entre listado y ficha: listado resume a 160 caracteres Unicode y hasta
tres líneas; «Ver más» abre la ficha mediante `onReadMore={onPress}`, sin expandir
la tarjeta. Dentro de la ficha conserva 240 caracteres y cuatro líneas, con
«Ver más / Ver menos» para desplegar el texto íntegro. Cambiar ID o descripción
reinicia expansión. El callback opcional omite el estado expanded accesible y
anuncia que abre detalles; al omitirlo mantiene expansión local.
Los botones de título/fechas/enlace siguen abriendo la misma ficha.
La ubicación se consulta dentro de la ficha completa junto
con organizador/estado; tarjeta y skeleton no muestran una línea de ubicación.
El enlace dice «Ver detalles y ubicación» o, si el usuario está JOINED confirmado,
«Ver detalles e inscritos». Las etiquetas accesibles usan el mismo texto; el
estado propio confirmado mantiene también el acceso histórico cuando la actividad
ya no está disponible públicamente, sin mostrar metadata anterior.
El tipo se indica en el
encabezado del grupo y mediante el color de borde; no se repite debajo del título
de cada tarjeta. La ficha completa conserva el tipo explícito y el skeleton del
listado anticipa la descripción sin esa línea de tipo.
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
`ActivityParticipationControls` muestra las acciones dentro de la ficha completa;
`ActivityParticipantCount` presenta el contador del listado.
En el listado, JOINED confirmado añade «(estás inscrito)» junto a Inscritos y
no muestra acciones de participación. Inscribirme está en la ficha; retiro usa
CalendarOff junto a la fila propia (tú), sin botón textual Desinscribirme. `canLeave`
confirmado por servidor es true solo para JOINED ajeno. El creador no puede retirarse,
y API/hook rechazan esa operación. Datos LEFT históricos conservan su estado.
Icono44/CalendarOff22 con label accesible se bloquea durante participación/eliminación.
Si falla listado o ficha pública, el mismo icono se ofrece en fila Tu inscripción
solo con capacidad propia confirmada, sin exponer contenido público anterior.
La ficha presenta Editar/Eliminar/Explorar como botones con texto y los iconos
Lucide `SquarePen`/`Trash`/`MapPinSearch`: filas de 64 puntos mínimos, icono22 sobre
superficie40 y borde/sombra suaves. Eliminar usa rojo y abre la confirmación existente.
Permisos de propietario, ubicaciones disponibles, callback de explorar y bloqueo
durante operaciones pendientes siguen controlando su disponibilidad.
Si el detalle público deja de estar disponible pero la participación propia es
JOINED, la tarjeta ofrece acceso a la ficha para consultar/retirarse sin mostrar
metadata pública anterior.
`ActivityParticipants` de la ficha consulta siete personas por página mediante
`ACTIVITY_PARTICIPANTS_PAGE_SIZE`; utiliza el mismo `components/Pagination.tsx`
numérico que el listado. Se oculta con siete inscritos o menos y aparece desde
ocho. `useActivityParticipants.goToPage` valida el salto y consulta la página
solicitada; muestra la página ajustada por el servidor si disminuye el total.
La lista reserva siete filas, conserva carga/error/reintento y no reutiliza nombres
de otra página, sesión o campus. El listado de actividades mantiene su límite de cinco.
Si el usuario actual está inscrito, el servidor lo coloca primero antes de paginar
y devuelve `isCurrentUser` para mostrar «Nombre (tú)» en la primera página.
El resto conserva orden estable, sin duplicar su fila ni inferir identidad por nombre.
El contador viene del detalle (`participantCount` opcional), nunca de cálculos cliente.
Después de retirarse se consulta de nuevo: un fallo no deshace el estado confirmado
ni se presenta como cero. No se añade ninguna colección ni caché de actividades.
`ActivityDetail` consulta la ficha por ID, muestra organizador y participación propia
y permite inscribirse. «Volver a las actividades» conserva la selección del mapa.
El hook cancela consultas obsoletas y revalida al vencer la actividad; cerrar el
modal desmonta la ficha. La inscripción usa `activity_participation` con JOINED/LEFT.

Cada apertura correctamente cargada de `ActivityDetail` registra VIEWED mediante
`POST /activities/:activityId/interactions`, con operationId UUID por apertura y
deduplicación en backend. Tarjetas y refresh no suman vistas; cerrar/reabrir sí.
La telemetría no bloquea la ficha ni conserva una cola offline. Inscripción/retiro
envían Idempotency-Key por intención y conservan la clave ante resultados inciertos.
El estado actual permanece en `activity_participation`; sus transiciones y vistas
se conservan en `activity_interactions` para analítica histórica.
La actualización manual se realiza arrastrando hacia abajo desde el inicio del
modal, con indicador de carga. En información del piso actualiza los contadores de
actividades vigentes; en Detalle de actividades actualiza el listado para mostrar
nuevas publicaciones, manteniendo ubicación y tipo seleccionados. En la ficha
actualiza su consulta individual, en lugar del botón Actualizar ficha.
`RefreshScrollView` de `src/components` conserva el scroll de piso, campus/edificio y notificaciones;
`useScrollRefresh` registra la consulta de la vista visible. El componente nulo
`ScrollRefreshRegistration` se monta únicamente en información del piso y en
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

Sin capacidad oficial, el formulario consulta
`GET /api/v1/activities/community/creation-availability` antes de mostrar los campos.
Si el organizador ya tiene una comunitaria ACTIVE/PUBLIC sin eliminar y con término
futuro en su campus, muestra «Solo puedes tener activa una actividad comunitaria.»
y permite comprobar de nuevo. Cuenta tanto futuras como en curso en cualquier
ubicación de la sede. El cupo se libera al terminar/eliminarse; no limita inscripciones
en actividades ajenas. Error de consulta permite Reintentar. Requests abortables y
clave de usuario/campus/capacidad evitan aplicar disponibilidad de otra identidad.
El backend vuelve a verificar al guardar y devuelve 409 con el mismo aviso si otra
solicitud ocupó el cupo; el formulario reconsulta. Perfiles con capacidad oficial
mantienen publicación múltiple y recurrencia, con sus permisos existentes.

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
término y el límite de repetición usan estos selectores. La referencia libre
del lugar se omite en creación y al editar actividades sin referencia previa.
La edición recibe `existingContent`: una descripción previa fuera del catálogo
puede conservarse como texto sin edición cuando falta capacidad oficial, o
sustituirse por una opción. Con capacidad oficial puede corregirse libremente.
Una referencia previa conserva su campo editable.
El editor permite cambiar edificio/piso/POI; `creationLocation` solo fija el
contexto espacial en creación. Las fechas no modificadas conservan segundos y
milisegundos, aunque el selector muestre precisión de minutos.

El adaptador `activityLocations` entrega edificios/pisos/POI por IDs de dominio
al formulario. Ordena edificios alfabéticamente por nombre en español con comparación
numérica natural (Cabaña A/B/C). El orden de pisos usa el número firmado visible
en el nombre «Piso …»; cuando no existe, usa `level` como respaldo. Esto cubre
pisos renombrados cuyo nombre ya no coincide con el nivel técnico del mapa.
Los pisos de nivel visible no negativo van primero en orden ascendente;
luego los negativos del más cercano al suelo al más profundo
(por ejemplo, 1, -2, -3). Creación comunitaria/oficial y edición comparten el orden,
sin modificar nombres, IDs ni datos originales del mapa.
No entrega meshes ni modifica la escena. Publicar refresca los
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

El selector «Repetir» del formulario comunitario/oficial se muestra únicamente con
`identity.capabilities.officialActivities`, la capacidad vigente de publicar eventos
oficiales en el campus. Al perderla, se descartan la selección recurrente y su preview.
El backend exige esa capacidad para preview/publicación de ambos tipos de serie;
la consulta e inscripción siguen disponibles conforme a sus reglas existentes.
El mismo formulario comunitario/oficial ofrece repetir diariamente, semanalmente
o mensualmente, con fecha final de los inicios y selección de días semanales.
`ActivityRecurrencePicker` muestra una fila «Repetir / Nunca» y abre un selector
modal con cuatro respuestas: No, solo una vez; Sí, todos los días; Sí, algunos días
de la semana; Sí, una vez al mes. La opción semanal despliega Lun–Dom con selección
múltiple. `weekdays` usa días ISO1–7; solo genera días marcados desde la fecha inicial,
sin forzar actividad ese primer día. Series antiguas sin este campo mantienen su regla.
¿Hasta cuándo? usa el selector de fecha con una etiqueta legible. Así quedará muestra
descripción natural y total real desde preview del backend, sin estimaciones locales.
Solicitudes debounced/abortables y clave de regla/contenido impiden mostrar totales
o confirmar hashes obsoletos. El modal no ofrece opciones avanzadas para editar
intervalos ni fechas a omitir. El contrato mantiene esos campos para compatibilidad
con reglas existentes; los intervalos semanales usan semanas ISO de lunes a domingo.
Los cambios se mantienen temporales hasta Listo; cancelar/cerrar/disabled no cambia
el formulario. Listo transfiere preview revisada y hash cuando el contenido coincide.
Si faltan datos básicos, se puede guardar configuración válida sin inventar total;
publicar sigue requiriendo preview. Un error de cálculo permite Reintentar.
Fecha final obligatoria, zona/horas locales, DST, límites y persistencia permanecen.
El contrato añade únicamente weekdays opcional; no ofrece anual/posiciones mensuales.
El backend
calcula la vista previa en la zona horaria del dispositivo; cambiar un campo exige
revisarla nuevamente. Cada fecha publicada tiene su ID de actividad y participación.
Para perfiles con capacidad oficial, las tarjetas distinguen la instancia con un distintivo «Ocurrencia X de N» y conservan
su ID, fechas e inscripción propias. El listado y los contadores del campus/edificio/
piso/POI cuentan una representante por serie, además de las actividades independientes.
Al finalizar pasa a la próxima incluso entre fechas; si cambia de piso/lugar, aparece
en la ubicación de esa instancia. Solapamientos conservan la primera por inicio hasta
su fin; fechas editadas determinan el orden, con índice/ID como desempate. Una serie
totalmente finalizada desaparece del listado vigente sin borrar sus documentos.
Solo perfiles con `identity.capabilities.officialActivities` ven el distintivo
«Ocurrencia X de N», información de serie y acceso a `ActivitySeriesView`. El usuario
común ve la actividad representante y conserva ficha/inscripción, sin textos de
ocurrencias en tarjeta, ficha o acciones de edición/eliminación. Revocar capacidad
cierra la vista de serie y aborta consultas; la clave de SeriesView incluye la
capacidad para no reutilizar datos privilegiados. GET de serie requiere la misma
capacidad en backend. El editor siempre usa ONE sin selector de alcance; preview
y guardado rechazan grupos para todos los perfiles, con propiedad/campus conservados.
No genera puntos en la escena ni agrupa datos persistidos o participaciones. La
metadata interna series y la API de listado/detalle se mantienen para agrupación
y relevo automático de representante.

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
editarse aunque esté en curso y solo cambia el ID abierto. No hay selector ni
edición de próximas en grupo; otras fechas, IDs e inscripciones se conservan.
La regla de creación permanece como referencia
histórica; el listado muestra las fechas reales editadas de cada ocurrencia.

Guardar refresca ficha y consulta compartida del campus, incluidos los resúmenes
por edificio. No modifica la selección, las geometrías ni los stores 3D.
La CTA «Explorar actividad en el mapa» de un aviso consulta la ubicación actual
autorizada y selecciona su edificio y piso en el mapa vigente. Abre la información
normal del piso, sin abrir automáticamente la ficha de actividad. El parámetro
activityId se consume al resolver el destino; la ficha puede consultarse desde
las actividades del piso. La carga del enlace no muestra tarjeta transitoria.

F2.6-08 usa el historial y eventos embebidos para notificaciones in-app; la bandeja
se abre desde Mi perfil y muestra un aviso previo independiente en modal. Una publicación de serie
oficial aparece con título y mensaje normales de publicación individual, sin textos
de recurrencia ni número/total. Backend anuncia cada ocurrencia al inicio real,
incluida la primera; guardar fechas futuras o vencer la anterior no anticipa el aviso. Cada aviso identifica su activityId
concreto y la CTA conduce a su piso, sin consultar el navegador de serie protegido por capacidad oficial.
Cambios conjuntos producen un aviso por usuario con su cantidad/motivos y destino
afectado. OFFICIAL_EVENT_STARTED solo se conserva como tipo histórico. Comunitarias
solo notifican cambios a participantes. Avisos anteriores
siguen conservados; carga/lectura/eliminación mantienen sus contratos y no hay push
externo ni actualización streaming. No crea puntos 3D.
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

