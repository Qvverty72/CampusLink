# Registro institucional F2.3-02

El MVP admite correo `duocuc.cl` para Duoc UC y campus activos de esa institución.

El registro utiliza las tablas existentes:

- `dominio_institucional`
- `institucion`
- `campus`
- `perfil_usuario`

**No se crean tablas nuevas.**

## 1. Migración

Aplicar la migración:

`src/database/supabase/migrations/20261008_institutional_registration.sql`

Ejecutarla en el **SQL Editor de Supabase** como propietario, después de:

`20261008_auth_context_rls.sql`

### Cambios realizados

- Ajusta las políticas RLS y los permisos (`GRANT`) sobre el catálogo existente.
- Agrega una clave foránea compuesta que garantiza que la institución y el campus coincidan en el perfil.
- Registra el dominio `duocuc.cl` si aún no está configurado.
- No crea tablas ni columnas nuevas.

### Compatibilidad con versiones anteriores

Si existe la tabla temporal `registro_institucional_pendiente`:

- **Sin registros:** se elimina automáticamente.
- **Con registros:** se aborta toda la migración para permitir revisar los datos antes de continuar.

### Verificación del catálogo

Comprobar los dominios institucionales y campus activos:

```sql
SELECT
    d.dominio,
    i.nombre AS institucion,
    c.nombre AS campus
FROM public.dominio_institucional d
JOIN public.institucion i
    ON i.id = d.institucion_id
JOIN public.campus c
    ON c.institucion_id = i.id
WHERE d.activo
  AND c.activo;