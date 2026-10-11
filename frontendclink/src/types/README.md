# Paleta compartida

Todos los módulos pueden importar la paleta de CampusLink desde `@/types/colors`:

```ts
import { APP_COLORS } from '@/types/colors';

const styles = StyleSheet.create({
  button: { backgroundColor: APP_COLORS.PRIMARY },
  label: { color: APP_COLORS.SECONDARY },
  highlight: { borderColor: APP_COLORS.ACCENT },
});
```

| Clave | Color |
| --- | --- |
| `PRIMARY` | `#002E56` |
| `SECONDARY` | `#3F6A8E` |
| `ACCENT` | `#FDBB30` |

Para cambiar estos colores, editar únicamente `colors.ts`. Los nuevos módulos
deben reutilizar estas constantes en vez de copiar sus valores hexadecimales.
Si necesitan nombres propios del dominio, pueden definir asociaciones a esta
paleta, como `ACTIVITY_COLORS` en `features/activities/types/activity.ts`.
