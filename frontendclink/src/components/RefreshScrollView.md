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

El spinner se activa al aceptar el gesto, antes del loading iniciado por los efectos del consumidor. El control nativo permanece habilitado visualmente durante la solicitud; el bloqueo síncrono JS impide volver a ejecutar onRefresh. El loading del consumidor debe transicionar a true y finalizar en false. `refreshIndicatorOffset` (default 0) permite situar el indicador nativo bajo el área segura; Perfil usa insets.top + 8. Web muestra spinner durante el arrastre y mientras actualiza.

Para un modal con varias vistas, omitir las props directas y registrar únicamente la vista visible:

```tsx
import { useScrollRefresh } from '@/components/RefreshScrollView';

useScrollRefresh(reload, loading, !loading && !saving, 'la ficha');
```

También se exporta `ScrollRefreshRegistration` con las props `onRefresh`, `refreshing`, `enabled`, `label`. Al desmontar se limpia el registro; no registrar simultáneamente lista y detalle. Las props directas tienen prioridad sobre registros hijos cuando se proporcionan.

`useScrollReset(viewKey)` vuelve al inicio cuando cambia una vista/página. `useCompactScrollHeader()` oculta/restaura el encabezado del contenedor y devuelve su cierre opcional. Estos controles utilizan `onClose` y `onHeaderVisibilityChange` del scroll y no dependen de un dominio.

En web, el gesto comienza arriba, con un dedo, movimiento vertical descendente de al menos 64 px y se confirma al soltar. No usa rueda/mouse. Limpia listeners y restaura overscroll al desmontar. En nativo también hay acción accesible para actualizar. No alternar este componente con un ScrollView simple según loading: eso remonta sus hijos y puede perder estado de formularios.

El archivo anterior `features/activities/components/ActivityRefreshScrollView.tsx` conserva aliases de compatibilidad; los consumidores nuevos deben importar esta implementación compartida.
