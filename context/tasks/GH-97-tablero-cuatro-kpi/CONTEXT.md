# Task Context

## Task

**ID:** GH-97  
**Title:** Consultar un tablero de cuatro KPI esenciales  
**GitHub URL:** https://github.com/Qvverty72/CampusLink/issues/97  
**Backlog ID:** F2.7-02  
**Backlog Title:** Consultar un tablero de cuatro KPI esenciales  
**Priority:** Must Have  
**Story Points:** 3  
**Status:** Completed  
**Started:** 2026-10-21  
**Last updated:** 2026-10-21

## Objective

Presentar cuatro KPI históricos para un campus autorizado y período consultado, con autorización de reportería.

## Scope

Consulta de usuarios activos al corte, demanda de recursos, demanda de asignaturas y registros de inscripción en actividades; pantalla de tablero y contrato de API. Filtros de múltiples campus/carrera y agrupación semanal o mensual pertenecen a F2.7-03 y F2.7-04.

## Acceptance Criteria

La issue GH-97 reproduce los criterios de F2.7-02: cuatro indicadores, valor/período/ámbito, separación de vistas y solicitudes y acceso exclusivo por permiso de reportería del campus.

## Backlog Requirements

F2.7-02 exige contar cuentas activas al corte, vistas y solicitudes de recursos, vistas y solicitudes por asignatura e inscripciones registradas. No se presenta la inscripción como asistencia. Cada indicador expone valor, período y ámbito institucional. Solo administradores o usuarios autorizados con reportería en el campus consultado pueden ver el tablero.

## Backlog Relationships

- F2.7-01: fuente persistente de eventos SQL y MongoDB.
- F2.7-03: selección de institución, varios campus y carrera; tarea posterior.
- F2.7-04: agrupación semanal/mensual y zona horaria institucional; tarea posterior.
- F2.3-05 y F2.3-06: roles, permisos por campus y autorización.
- F2.6-07: `JOINED` representa inscripción, no asistencia.

## Pending Backlog Decisions

- F2.7-04 define una zona horaria de referencia consistente para cada institución sin especificar aquí su selección. Este tablero usa límites UTC explícitos para su consulta simple; el filtrado y agrupación institucional quedan para F2.7-04.
- F2.3-05 conserva pendiente el catálogo de roles fijos. Se reutiliza el catálogo y la capacidad de reportería ya implementados sin cambiarlo.

## Related Context

- GH-41: `context/tasks/GH-41-registrar-eventos-analitica/SUMMARY.md` define el historial `evento_analitica`, la captura de vistas y `activity_interactions`.
- `backendclink/src/modules/analytics`, `backendclink/src/modules/auth/auth.authorization.ts`, `frontendclink/app/(analytics)/analytics.tsx`, `frontendclink/app/_layout.tsx`.

## Development Log

### 2026-10-21

#### Objective

Conectar los cuatro KPI al historial existente y mostrar el tablero con acceso de reportería.

#### Work completed

Se localizó GH-97, se comparó F2.7-02 con F2.7-01 y la pantalla actual, y se identificó que la puerta visible de Analítica usaba un permiso distinto del exigido por el backlog. Se añadió `GET /api/v1/analytics/dashboard` con cuatro indicadores para el campus autorizado y fechas civiles UTC. El backend reconstruye usuarios activos desde la última transición anterior al corte, cuenta vistas y solicitudes SQL por recurso y asignatura, y usa `JOINED` de MongoDB para inscripciones. La pantalla ahora presenta los cuatro KPI con valor, período y ámbito, detalle de vistas/solicitudes, formulario de fechas y estados de carga/error. La navegación y el enlace del perfil exigen capacidad de reportería.

#### Files modified

- `context/tasks/GH-97-tablero-cuatro-kpi/CONTEXT.md`
- `context/tasks/GH-97-tablero-cuatro-kpi/SUMMARY.md`
- `context/TASK_INDEX.md`
- `backendclink/src/modules/analytics/analytics.dashboard.ts`
- `backendclink/src/modules/analytics/analytics.repository.ts`
- `backendclink/src/modules/analytics/analytics.controller.ts`
- `backendclink/src/modules/analytics/analytics.routes.ts`
- `backendclink/tests/analytics-dashboard.test.ts`
- `backendclink/README.md`
- `frontendclink/src/features/analytics/api/dashboardApi.ts`
- `frontendclink/app/(analytics)/analytics.tsx`
- `frontendclink/app/_layout.tsx`
- `frontendclink/src/features/users/components/ProfileScreen.tsx`

#### Technical decisions

- El corte de cuentas usará la última transición anterior al fin exclusivo del intervalo.
- Las consultas simples indicarán que el período está en UTC. La selección de zona institucional pertenece a F2.7-04.
- La autorización se comprueba por campus con `reports` (`ACCEDER_REPORTERIA` o rol administrador), y PostgreSQL valida que el campus activo pertenezca a la institución del perfil.
- Los eventos con varias asignaturas cuentan una vez por asignatura; el total de demanda de asignaturas puede superar el total de demanda de recursos.
- La pantalla usa el campus vigente de la sesión. La selección institucional y de varios campus pertenece a F2.7-03.

#### Tests and validation

`backendclink`: typecheck y build aprobados; `analytics-dashboard.test.ts` y `analytics-events.test.ts` aprobados, 3 pruebas en total. La prueba nueva cubre corte histórico, límites de fecha, campus ajeno, vistas/solicitudes y distribución por asignatura, además de validación de fechas y rechazo sin permiso. `frontendclink`: typecheck aprobado tras instalar dependencias y regenerar los tipos locales de Expo Router. `git diff --check` sin errores.

#### Problems or blockers

No se ejecutó una prueba de interfaz en dispositivo ni contra los servicios desplegados. La migración F2.7-01 debe estar aplicada en el entorno antes de usar el endpoint.

#### Pending work

F2.7-03 deberá ampliar filtros a institución, múltiples campus y carrera; F2.7-04 deberá definir y aplicar agrupación semanal/mensual y referencia horaria institucional. No queda trabajo de F2.7-02.

#### Next recommended step

Al ampliar filtros o exportación, reutilizar las fórmulas de `analytics.repository.ts` y preservar la comprobación de reportería por campus.
