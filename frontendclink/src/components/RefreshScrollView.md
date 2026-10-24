# RefreshScrollView

Scroll compartido con pull-to-refresh nativo en iOS/Android y gesto táctil en web. Mantiene el mismo ScrollView, su ref y el RefreshControl montado al cambiar de vista.

```tsx
import { RefreshScrollView } from '@/components/RefreshScrollView';

<RefreshScrollView
  onRefresh={reload}
  refreshing={loading}
  refreshEnabled={!loading && !saving}
  refreshLabel="los recursos"
  indicatorColor="#002E56"
  contentContainerStyle={{ padding: 16 }}
>
  {content}
</RefreshScrollView>
```

`onRefresh` dispara la consulta; el consumidor controla `refreshing` hasta que termine o falle. `refreshEnabled` protege cargas/mutaciones y formularios. El indicador corresponde al gesto solicitado, no a la carga inicial. Para el skeleton inicial se usa `Skeleton.tsx`. Los fallos deben finalizar loading y permitir reintentar.

El spinner se activa al aceptar el gesto, antes del loading iniciado por los efectos del consumidor. El control nativo permanece habilitado visualmente durante la solicitud; el bloqueo síncrono JS impide volver a ejecutar onRefresh. El loading del consumidor debe transicionar a true y finalizar en false. `refreshIndicatorOffset` (default 0) permite situar el indicador nativo bajo el área segura; Perfil, Mercado, Biblioteca y el modal de acuerdo físico usan insets.top + 8. El paddingTop de contentContainerStyle solo desplaza el contenido: no mueve el UIRefreshControl de iOS. Web muestra spinner durante el arrastre y mientras actualiza.

Para un modal con varias vistas, omitir las props directas y registrar únicamente la vista visible:

```tsx
import { useScrollRefresh } from '@/components/RefreshScrollView';

useScrollRefresh(reload, loading, !loading && !saving, 'la ficha');
```

También se exporta `ScrollRefreshRegistration` con las props `onRefresh`, `refreshing`, `enabled`, `label`. Al desmontar se limpia el registro; no registrar simultáneamente lista y detalle. Las props directas tienen prioridad sobre registros hijos cuando se proporcionan.

`useScrollReset(viewKey)` vuelve al inicio cuando cambia una vista/página. `useCompactScrollHeader()` oculta/restaura el encabezado del contenedor y devuelve su cierre opcional. Estos controles utilizan `onClose` y `onHeaderVisibilityChange` del scroll y no dependen de un dominio.

Los callbacks registrados mediante `useScrollRefresh` deben ser estables (por ejemplo, con `useCallback`). El registro actualiza el contexto del contenedor; crear otro callback en cada render puede provocar un ciclo de registro y renderizado.

`useScrollRefresh(onRefresh, refreshing, enabled, label, active = true)` acepta una quinta opción para pestañas que permanecen montadas pero ocultas: `active=false` libera su registro. `enabled=false` conserva el registro de la vista visible mientras carga o protege una acción; no equivale a ocultarla. En Mercado/Biblioteca, `useMarketplaceRefresh` adapta callbacks variables a un registro estable.

Mercado y Biblioteca usan este scroll en catálogos y paneles personales. El gesto de catálogo vuelve a página1 conservando búsqueda y filtros; Biblioteca también vuelve a cargar recomendaciones. Solo la pestaña visible registra refresh. Publicación, solicitud, edición, valoración y denuncia no permiten refresco que descarte sus borradores. Los detalles mantienen lectura al abrir/enviar. Los acuerdos abiertos y en curso consultan su estado cada20s en foreground, sin skeleton de recarga; detienen esa consulta en segundo plano, pestaña oculta, formularios, decisiones o escrituras. El gesto manual del acuerdo mantiene su consulta completa existente.

En Perfil, las listas de publicaciones/transacciones, solicitudes enviadas/recibidas, recursos adquiridos e inscripciones registran la consulta de su vista visible. El modal de cuenta (Perfil académico/Cerrar sesión) y todas sus vistas de consulta/edición académica usan `ScrollView` normal, sin pull-to-refresh. Confirmaciones de solicitudes/acuerdos, denuncias, mutaciones y descargas bloquean el gesto para conservar el trabajo en curso. Los detalles físicos y acuerdos tienen su propio `RefreshScrollView`; el detalle de actividad reutiliza su registro existente. El refresh de un recurso adquirido consulta ese mismo detalle sin volver a la lista. Se conserva la página visible.

En web, el gesto comienza arriba, con un dedo, movimiento vertical descendente de al menos 64 px y se confirma al soltar. No usa rueda/mouse. Limpia listeners y restaura overscroll al desmontar. En nativo también hay acción accesible para actualizar. No alternar este componente con un ScrollView simple según loading: eso remonta sus hijos y puede perder estado de formularios.

El archivo anterior `features/activities/components/ActivityRefreshScrollView.tsx` conserva aliases de compatibilidad; los consumidores nuevos deben importar esta implementación compartida.

La bandeja de Notificaciones conserva pull-to-refresh. Los avisos de actividad abiertos usan `ScrollView` normal, sin gesto de recarga. Los detalles físicos y acuerdos reciben `refreshEnabled={false}` cuando se abren desde Notificaciones; en otros puntos de entrada mantienen su comportamiento predeterminado.
