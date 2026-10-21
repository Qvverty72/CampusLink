# Task Context

## Task

- **ID:** GH-41
- **Title:** Registrar eventos para analítica
- **GitHub URL:** https://github.com/Qvverty72/CampusLink/issues/41
- **Backlog ID:** F2.7-01
- **Backlog Title:** Registrar eventos para analítica
- **Priority:** Must Have
- **Story Points:** 5
- **Status:** Completed
- **Started:** 2026-10-21
- **Last updated:** 2026-10-21

## Objective

Registrar eventos duraderos para demanda de recursos y participación en actividades, con fecha exacta, campus, actor y referencia, y conservar cambios de cuenta para el KPI histórico de usuarios activos.

## Scope

Vistas de publicaciones físicas y digitales; solicitudes y transiciones de transacciones físicas y digitales; historial de inscripciones ya escrito en MongoDB; historial de estados de cuenta. No incluye tablero ni exportación.

## Acceptance Criteria

Los criterios de GitHub #41 coinciden con el backlog F2.7-01: registrar eventos sin duplicarlos por reintentos y conservar los datos tras eliminaciones lógicas. Las búsquedas son opcionales.

## Backlog Requirements

Cada evento debe conservar fecha y hora, campus, tipo, referencia del recurso o actividad y actor cuando exista. Las solicitudes, vistas, transiciones de transacción e inscripciones alimentan los KPI futuros. El estado histórico de cuentas debe poder reconstruirse. Los datos deben sobrevivir a retiros lógicos.

## Backlog Relationships

- F2.3-07: cambios auditados del estado de cuenta.
- F2.4-04, F2.4-06, F2.4-07, F2.4-08: vistas, solicitudes y acuerdos físicos.
- F2.5-05, F2.5-06: vistas y solicitudes digitales.
- F2.6-07: inscripciones y retiros de actividades.
- F2.7-02, F2.7-03, F2.7-04: consumos posteriores por KPI, filtros y períodos.

## Pending Backlog Decisions

None.

## Related Context

Este checkout no contenía `context/tasks/`, `context/TASK_INDEX.md` ni resúmenes históricos. La ruta documentada para `SKILL.md` y `references/` no existe; el skill está en `.agents/skills/SKILL.md` y el backlog en `.agents/skills/task-context-management/product-backlog-campuslink.md`.

El código actual ya registra `activity_interactions` en MongoDB con clave idempotente, fecha, campus y actor para `JOINED` y `LEFT`. La biblioteca escribe `interaccion_recurso` para vistas digitales, pero solo como señal opcional de recomendaciones. No hay registro completo de vistas físicas ni eventos SQL autónomos para solicitudes y transiciones. Auditoría de cuenta y `created_at` de perfil conservan parte del historial, pero falta una fuente uniforme para el KPI.

## Development Log

### 2026-10-21

#### Objective

Implementar y validar el registro de eventos de F2.7-01.

#### Work completed

Se añadió `evento_analitica` con eventos inmutables de vistas, solicitudes, estados de transacción y cambios de cuenta. La migración reconstruye registros previos desde las tablas operacionales y la auditoría de cuentas; los disparadores registran cambios nuevos en la misma transacción que su operación. Las vistas físicas y digitales utilizan una inserción común serializada por publicación y conservan una vista por usuario y recurso durante 24 horas. El historial MongoDB de `JOINED` y `LEFT` se mantiene como fuente de participación en actividades. La comprobación de salud ahora exige la tabla de eventos.

#### Files modified

- `.gitignore`
- `backendclink/README.md`
- `backendclink/src/database/supabase/migrations/f2_7_01_eventos_analitica.sql`
- `backendclink/src/database/supabase/health.ts`
- `backendclink/src/modules/analytics/analytics.repository.ts`
- `backendclink/src/modules/marketplace/elibrary/elibrary.recommendations.repository.ts`
- `backendclink/src/modules/marketplace/elibrary/elibrary.recommendations.service.ts`
- `backendclink/src/modules/marketplace/physicalgoods/physicalgoods.images.service.ts`
- `backendclink/src/modules/users/access.repository.ts`
- `backendclink/src/modules/users/access.service.ts`
- `backendclink/tests/analytics-events.test.ts`
- `backendclink/tests/elibrary.test.ts`
- `backendclink/tests/physicalgoods.test.ts`
- `context/tasks/GH-41-registrar-eventos-analitica/CONTEXT.md`
- `context/tasks/GH-41-registrar-eventos-analitica/SUMMARY.md`
- `context/TASK_INDEX.md`

#### Technical decisions

Se reutiliza el historial transaccional MongoDB de actividades, porque ya tiene fecha, campus, actor, referencia y claves idempotentes. Los disparadores PostgreSQL cubren operaciones SQL incluso si cambian los servicios que las ejecutan. `event_key` único evita repetir una transición; las vistas conservan la ventana de 24 horas que ya empleaba la biblioteca digital, ahora con bloqueo de publicación para evitar carreras. Los eventos guardan IDs institucionales y de asignaturas como instantánea, sin claves foráneas al contenido para resistir retiros lógicos. El trigger de cuenta lee el actor de una configuración local a la transacción.

#### Tests and validation

`npm run typecheck` y `npm run build` aprobaron. `tests/analytics-events.test.ts` aplicó la migración dos veces en PGlite y verificó backfill, vistas duplicadas, rollback, transiciones, actor y conservación tras retiro lógico. La prueba de migración y las suites de biblioteca digital y recursos físicos aprobaron 186/186 casos en conjunto, con la migración aplicada. Las suites de acceso y participación aprobaron antes de añadir aserciones específicas de eventos. El host trae Node 24 aunque el proyecto pide Node 22; se necesitó un preload temporal para evitar un fallo de `os.userInfo()` del entorno de pruebas. Ese archivo temporal se eliminó.

#### Problems or blockers

El checkout carecía de la estructura de contexto descrita en `AGENTS.md` y `.gitignore` la excluía; se corrigió el ignore para versionar índice y contextos de tareas. Supabase CLI no está instalado, por lo que la migración sigue la convención SQL existente del repositorio. El backfill de `subject_ids` refleja las relaciones presentes al migrar; las relaciones antiguas ya retiradas no se pueden reconstruir desde las tablas actuales.

#### Pending work

Aplicar `f2_7_01_eventos_analitica.sql` al desplegar el backend. El tablero y sus consultas pertenecen a F2.7-02 y siguientes.

#### Next recommended step

Al implementar F2.7-02, calcular usuarios activos al corte desde la última transición de cuenta por usuario y combinar los eventos SQL con `activity_interactions` para participación.
