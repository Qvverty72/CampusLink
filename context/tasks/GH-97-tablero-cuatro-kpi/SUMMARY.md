# Technical Task Summary

## Task

**ID:** GH-97  
**Title:** Consultar un tablero de cuatro KPI esenciales  
**Backlog ID:** F2.7-02  
**Backlog Title:** Consultar un tablero de cuatro KPI esenciales  
**Priority:** Must Have  
**Story Points:** 3  
**Status:** Completed  
**Completed:** 2026-10-21  
**GitHub URL:** https://github.com/Qvverty72/CampusLink/issues/97

## Requirement Implemented

Tablero con usuarios activos al corte, demanda de recursos, demanda por asignatura y registros de inscripción a actividades para un ámbito y período. Cada indicador muestra valor, período y ámbito. La demanda distingue vistas y solicitudes. El acceso requiere rol administrador o usuario autorizado con permiso de reportería en el campus consultado.

## Summary

La ruta `GET /api/v1/analytics/dashboard` consulta el historial SQL de F2.7-01 y los eventos `JOINED` de MongoDB. La pantalla de Analítica presenta los cuatro KPI del campus de la sesión y permite consultar un rango de fechas civiles UTC.

## Implemented functionality

- Reconstrucción de cuentas activas desde la última transición previa al corte, incluso cuando las cuentas se desactivaron después.
- Conteo separado de vistas y solicitudes de recursos dentro del rango.
- Conteo de vistas y solicitudes por asignatura usando `subject_ids` conservados en el evento; evita duplicar una asignatura dentro del mismo evento.
- Conteo de inscripciones `JOINED` sin afirmar asistencia presencial. Incluye la inscripción del creador que registra F2.6-07.
- Identificación visible del ámbito institucional, campus, período y zona UTC en cada tarjeta.
- Validación de fechas y campus, denegación sin reportería y estados de carga/error con reintento manual.

## Technical implementation

`analytics.dashboard.ts` valida la consulta, aplica `requireCampusCapability(..., 'reports')` y compone los cuatro indicadores. `analytics.repository.ts` consulta `evento_analitica` y reutiliza `countActivityInteractions`; el campus se confirma como activo y de la institución del perfil. El intervalo es `[from 00:00 UTC, día siguiente a to 00:00 UTC)`. La pantalla Expo usa `authenticatedEnvelopeRequest`, que adjunta el token y limita la URL al backend propio. El guard de Expo y el enlace del perfil se basan en `capabilities.reports`; el backend conserva la autorización definitiva.

## Files created

- `backendclink/src/modules/analytics/analytics.dashboard.ts`
- `backendclink/tests/analytics-dashboard.test.ts`
- `frontendclink/src/features/analytics/api/dashboardApi.ts`
- `context/tasks/GH-97-tablero-cuatro-kpi/CONTEXT.md`
- `context/tasks/GH-97-tablero-cuatro-kpi/SUMMARY.md`

## Files modified

- `backendclink/src/modules/analytics/analytics.repository.ts`
- `backendclink/src/modules/analytics/analytics.controller.ts`
- `backendclink/src/modules/analytics/analytics.routes.ts`
- `backendclink/README.md`
- `frontendclink/app/(analytics)/analytics.tsx`
- `frontendclink/app/_layout.tsx`
- `frontendclink/src/features/users/components/ProfileScreen.tsx`
- `context/TASK_INDEX.md`

## Files removed

None.

## Important technical decisions

- Se usa `ACCEDER_REPORTERIA`, exigido por F2.7-02, en vez del acceso genérico `ACCEDER_ANALITICA` que protegía la pantalla vacía.
- La consulta usa el campus actual en la interfaz; la API admite otro campus de la misma institución si existe permiso vigente. F2.7-03 ampliará filtros a varias sedes y carrera.
- Se explicita UTC para esta consulta simple. La agrupación y referencia horaria institucional corresponden a F2.7-04.
- La demanda de asignaturas suma interacciones atribuidas a cada asignatura; una interacción de un recurso con varias asignaturas aparece en cada una, explicado en la interfaz.

## Business Rules Implemented

- F2.7-02: cuatro KPI, valor/período/ámbito, separación de vistas y solicitudes, permiso de reportería por campus.
- F2.7-01: consumo de hechos históricos duraderos para recursos y cuentas.
- F2.3-06: identidad, cuenta activa, rol/permiso y campus autorizados antes de devolver indicadores.
- F2.6-07: `JOINED` mide inscripción, no asistencia.

## Interfaces and contracts

`GET /api/v1/analytics/dashboard?from=AAAA-MM-DD&to=AAAA-MM-DD[&campusId=UUID]` devuelve sobre `{data}` con `period`, `scope`, `generatedAt` y `activeUsers`, `resourceDemand`, `subjectDemand`, `activityParticipation`. Cada KPI contiene `value`, `period` y `scope`. Demanda añade `views`/`requests` y asignaturas añade `subjects[]`. Fechas inválidas: 400; campus o permiso ajeno: 403. No hay migración ni variable de entorno nueva.

## Dependencies

Usa PostgreSQL/Supabase con la migración F2.7-01 aplicada, MongoDB `activity_interactions`, autenticación existente y Expo Router. No se añadieron paquetes al proyecto.

## Testing and validation

Typecheck y build del backend aprobados; typecheck del frontend aprobado después de regenerar los tipos locales de Expo Router. `analytics-dashboard.test.ts` y `analytics-events.test.ts` aprobaron 3 pruebas; la nueva prueba usa PGlite para verificar corte de cuenta, límites de período, campus, demanda por asignatura y denegación sin permiso. `git diff --check` sin errores.

## Known limitations

No se ejecutó una prueba de interfaz en dispositivo ni con servicios desplegados. El tablero usa un campus por consulta y fechas UTC; selección de varios campus/carrera y agrupación semanal/mensual pertenecen a F2.7-03/F2.7-04. PostgreSQL y MongoDB no comparten una transacción de lectura, por lo que un evento concurrente puede entrar en una fuente durante la consulta de la otra.

## Backlog Relationships

- F2.7-01: genera los eventos que alimentan estos KPI.
- F2.7-03: filtros institucionales, múltiples campus y carrera.
- F2.7-04: agrupación por semana/mes y referencia horaria institucional.
- F2.3-05/F2.3-06: roles, permisos y autorización por campus.
- F2.6-07: semántica de inscripción de actividades.

## Related Historical Tasks

- GH-41: creó `evento_analitica` y documentó `activity_interactions` para el tablero.

## Pending Backlog Decisions

F2.7-04 no concreta aún la zona horaria institucional que se usará para agrupar. Esta consulta F2.7-02 comunica UTC explícitamente; F2.7-04 deberá resolver su referencia horaria antes de cambiar la semántica de fechas. El catálogo de roles fijos pendiente en F2.3-05 no se modificó aquí.

## Future modification guide

Comenzar por `analytics.dashboard.ts` para validación/autorización y `analytics.repository.ts` para fórmulas. `dashboardApi.ts` define el contrato consumido por `analytics.tsx`. Al añadir filtros o reportes, reutilizar las mismas reglas de cálculo y comprobar el permiso para cada campus solicitado. Conservar los resúmenes históricos de GH-41 y GH-97 sin reescribirlos.

## Final state

Un administrador o usuario autorizado con reportería puede abrir el tablero y consultar cuatro KPI históricos para el campus de su sesión y un período UTC, con fuentes, desglose y ámbito visibles. Un usuario sin ese acceso no puede consultar el endpoint ni navegar a la pantalla.
