# CampusLink — Supabase Seed

Esta carpeta contiene los datos maestros iniciales de la base relacional de CampusLink.

## Archivo actual

### `001_base_catalogs.sql`

Carga los datos mínimos necesarios para que un entorno nuevo de Supabase tenga contexto de negocio:

- `institucion`: Duoc UC.
- `campus`: Sede Concepción.
- `rol`: `USUARIO_INSTITUCIONAL`, `USUARIO_AUTORIZADO`, `ADMINISTRADOR`.
- `permiso`: permisos que las policies/RLS del esquema actual ya consultan.
- `rol_permiso`: permisos administrativos base para `ADMINISTRADOR`.

No carga usuarios, perfiles, carreras, asignaturas, publicaciones, solicitudes ni transacciones. Esos datos pertenecen a otros seeds o se generan mediante el uso normal de la aplicación.

## Por qué existe un seed

Las migraciones versionan la **estructura** de la base de datos; los seeds versionan los **datos maestros iniciales**.

```text
migrations/
└── tablas, FK, constraints, funciones, RLS, policies...

seed/
└── institución, campus, roles, permisos, catálogos...
```

Esto permite recrear un entorno sin insertar manualmente los mismos datos cada vez.

## UUID del campus y MongoDB

En una base vacía, `001_base_catalogs.sql` crea la Sede Concepción con este UUID estable:

```text
22222222-2222-4222-8222-222222222222
```

Ese UUID es la referencia lógica que puede guardarse en MongoDB:

```javascript
{
  campusId: "22222222-2222-4222-8222-222222222222"
}
```

MongoDB mantiene sus propios `_id` (`ObjectId`), mientras los UUID provenientes de Supabase se guardan como referencias lógicas. No existe una FK física entre PostgreSQL y MongoDB; la validación entre ambos motores corresponde al backend.

> Importante: el UUID fijo se garantiza cuando el seed se ejecuta sobre un entorno donde el catálogo todavía no existe. Si una fila con el mismo nombre ya existía previamente con otro UUID, el seed no reemplaza su clave primaria.

## Ejecución en Supabase remoto

La forma más simple durante el desarrollo es abrir **Supabase → SQL Editor**, pegar el contenido de `001_base_catalogs.sql` y ejecutarlo una vez.

El archivo debe permanecer versionado en GitHub aunque ya se haya ejecutado en el proyecto remoto.

## Verificación

Para obtener el UUID real de la sede desplegada:

```sql
SELECT
  c.id AS campus_id,
  c.nombre AS campus,
  i.nombre AS institucion
FROM public.campus c
JOIN public.institucion i
  ON i.id = c.institucion_id;
```

Para revisar los permisos base del administrador:

```sql
SELECT
  r.nombre AS rol,
  p.nombre AS permiso
FROM public.rol_permiso rp
JOIN public.rol r ON r.id = rp.rol_id
JOIN public.permiso p ON p.id = rp.permiso_id
ORDER BY r.nombre, p.nombre;
```

## Próximos seeds

Cuando el equipo tenga los datos académicos oficiales, puede agregarse un segundo archivo, por ejemplo:

```text
002_academic_catalog.sql
```

para versionar:

- carreras;
- asignaturas;
- `campus_carrera`;
- `carrera_asignatura`.

No conviene inventar esos códigos o catálogos antes de definir los datos reales que usará CampusLink.

## Ubicación recomendada en el repositorio

```text
backendclink/
└── supabase/
    ├── migrations/
    │   └── 20260923011638_remote_schema.sql
    └── seed/
        ├── 001_base_catalogs.sql
        └── README.md
```

## Regla del equipo

- Cambios de esquema → **migration**.
- Datos maestros iniciales → **seed**.
- Datos generados por usuarios → **no van en seeds de producción**.
- Credenciales y claves → **nunca se versionan**.