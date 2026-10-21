# Technical Task Summary

## Task

- **ID:** GH-41
- **Title:** Registrar eventos para analítica
- **Backlog ID:** F2.7-01
- **Backlog Title:** Registrar eventos para analítica
- **Priority:** Must Have
- **Story Points:** 5
- **Status:** Completed
- **Completed:** 2026-10-21
- **GitHub URL:** https://github.com/Qvverty72/CampusLink/issues/41

## Requirement Implemented

Se registran vistas, solicitudes y cambios relevantes de transacciones con fecha exacta, campus, institución, tipo, referencia y actor. Se conserva el estado histórico de cuentas para futuros cortes de usuarios activos. El historial previo de inscripciones y retiros de actividades continúa en MongoDB. Los registros sobreviven a retiros lógicos y evitan duplicación por reintentos.

## Summary

`evento_analitica` es el historial PostgreSQL de recursos y cuentas. Una migración reconstruye los eventos operacionales previos y agrega disparadores atómicos para cambios nuevos. Las vistas físicas y digitales se registran en `interaccion_recurso`, que alimenta el historial por disparador. La participación en actividades ya cuenta con `activity_interactions` transaccional en MongoDB.

## Implemented functionality

- Backfill de vistas, solicitudes, transacciones y estados de cuenta desde registros existentes.
- Captura de solicitudes y transiciones físicas y digitales, con actor y asignaturas del recurso en el momento del evento.
- Captura de vistas de detalles físicos y digitales con deduplicación por usuario y publicación durante 24 horas.
- Captura de altas y cambios de estado o eliminación lógica de cuentas; el actor administrativo se transmite mediante configuración local a la transacción.
- Conservación de eventos tras retiro lógico del recurso o cuenta.

## Technical implementation

La migración crea `public.evento_analitica`, índices por campus, institución, tiempo, recurso, cuenta y asignaturas, RLS sin acceso del cliente, y disparadores sobre `interaccion_recurso`, `solicitud_recurso`, `transaccion_recurso` y `perfil_usuario`. Cada evento tiene `event_key` único; las escrituras fuente y su evento se confirman o revierten juntas. `recordResourceView` bloquea la publicación antes de verificar una vista reciente e insertar otra. `activity_interactions` conserva los eventos MongoDB de inscripción con su `eventKey` idempotente y fecha original.

## Files created

- `backendclink/src/database/supabase/migrations/f2_7_01_eventos_analitica.sql`
- `backendclink/tests/analytics-events.test.ts`
- `context/tasks/GH-41-registrar-eventos-analitica/CONTEXT.md`
- `context/tasks/GH-41-registrar-eventos-analitica/SUMMARY.md`
- `context/TASK_INDEX.md`

## Files modified

- `.gitignore`
- `backendclink/README.md`
- `backendclink/src/database/supabase/health.ts`
- `backendclink/src/modules/analytics/analytics.repository.ts`
- `backendclink/src/modules/marketplace/elibrary/elibrary.recommendations.repository.ts`
- `backendclink/src/modules/marketplace/elibrary/elibrary.recommendations.service.ts`
- `backendclink/src/modules/marketplace/physicalgoods/physicalgoods.images.service.ts`
- `backendclink/src/modules/users/access.repository.ts`
- `backendclink/src/modules/users/access.service.ts`
- `backendclink/tests/elibrary.test.ts`
- `backendclink/tests/physicalgoods.test.ts`

## Files removed

None.

## Important technical decisions

- Se reutilizó `activity_interactions` para actividades; ya cumple persistencia e idempotencia sin duplicar hechos entre bases.
- Los disparadores SQL capturan operaciones desde cualquier ruta del backend y garantizan atomicidad.
- Las vistas usan la deduplicación de 24 horas ya existente en biblioteca digital y bloqueo de publicación para carreras simultáneas; las vistas propias no se cuentan como demanda.
- Los eventos conservan campus, institución, tipo de recurso y asignaturas como instantánea y no dependen de que la publicación o cuenta siga visible.
- `.gitignore` permite versionar la documentación obligatoria de tareas sin añadir los documentos históricos obsoletos.

## Business Rules Implemented

- F2.7-01: fecha exacta, campus, tipo, referencia, actor, deduplicación y persistencia histórica.
- F2.3-07: cambios de cuenta conservados junto al actor de suspensión o desactivación.
- F2.6-07: `JOINED` del historial MongoDB mide inscripción, no asistencia presencial.

## Interfaces and contracts

Nueva tabla interna `public.evento_analitica` y función interna `recordResourceView`. Sin endpoint público nuevo. La comprobación de salud de analítica ahora requiere la tabla. `setAccountState` recibe el actor administrativo para la transacción.

## Dependencies

PostgreSQL/Supabase para eventos de recursos y cuentas; MongoDB para actividad; PGlite como validación aislada. No se agregaron paquetes.

## Testing and validation

`npm run typecheck` y `npm run build` aprobaron. La migración se aplicó dos veces en PGlite y se probaron backfill, deduplicación, rollback, transiciones, actor y persistencia tras retiro lógico. La prueba de migración más las suites de biblioteca y recursos físicos aprobaron 186/186 pruebas en conjunto, con la migración aplicada. Las suites de acceso y participación también aprobaron antes de las aserciones nuevas de eventos.

## Known limitations

La migración debe aplicarse al entorno de despliegue antes de ejecutar este backend. El backfill de asignaturas solo puede usar las relaciones presentes al migrar. No se registran búsquedas, permitidas como opcionales por F2.7-01. El tablero y sus consultas corresponden a F2.7-02 y posteriores.

## Backlog Relationships

- F2.3-07: estados de cuenta y auditoría.
- F2.4-04, F2.4-06, F2.4-07, F2.4-08: vistas, solicitudes y transacciones físicas.
- F2.5-05, F2.5-06: vistas, solicitudes y transacciones digitales.
- F2.6-07: inscripciones históricas de actividades.
- F2.7-02, F2.7-03, F2.7-04: próximos consumidores del historial.

## Related Historical Tasks

No había `SUMMARY.md` previos en este checkout.

## Pending Backlog Decisions

None.

## Future modification guide

Para nuevos eventos SQL, comenzar por los disparadores de la migración y el esquema `evento_analitica`. Para vistas, comenzar por `recordResourceView` y los detalles físico/digital. Para actividad, usar `activities.interactions.ts` y la colección `activity_interactions`. F2.7-02 debe usar la última transición de cuenta anterior al corte, distinguir vistas de solicitudes y combinar la colección MongoDB para participación.

## Final state

Las acciones nuevas generan hechos históricos idempotentes, con ámbito y referencia estables, preparados para el tablero analítico.
