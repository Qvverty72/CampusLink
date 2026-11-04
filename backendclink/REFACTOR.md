# Registro del refactor modular

Entrega técnica del30–31 de octubre de2026, autorizada directamente por el usuario.
No tiene historia funcional ni Story Points propios. Conserva F2.2-03/04 y los
comportamientos actuales de F2.2-06..10 y de los módulos posteriores.

## Base y rama

- Base verificada después de `git fetch origin --prune`:
  `integracion3@8eceb05a6206db9c6f9309766fec8aaed2db06b6`.
- La base contiene `UI/UX-px@1d40f7d` y los cinco tickets F2.2 completados.
- Rama de trabajo: `refactor/backend-modular`.
- Código final: `af8d6137b5cae950f55c02b072b1a6a9042262d4`; los documentos se
  agregan en el commit posterior de documentación. El SHA de entrega se obtiene
  con `git rev-parse HEAD` en esta rama.
- El árbol estaba limpio al comenzar. No se modifica el historial anterior,
  no se fusiona a main/integracion3 y no se cierran issues automáticamente.

## Antes y después

| Antes | Después |
| --- | --- |
| Archivos de cada módulo al mismo nivel | `controllers`, `services`, `repositories`, `domain`, `types` y carpetas específicas según código real |
| Respuestas y errores repartidos entre services/middleware/types | Infraestructura consolidada en `shared`; readiness permanece en composición |
| Routers users/notificaciones/actividades con handlers inline | Controladores y validadores explícitos, rutas conservadas |
| SQL de resumen y lock de notificaciones en servicios users | Consultas en repositorios, misma transacción y filtros |
| Lectura Mongo propia dentro de activities.mine.service | Pipeline y consulta en activities.mine.repository |
| Analytics con SQL y agregación Mongo juntos | Repositorios de eventos/salud, snapshots, dashboard y actividades |
| Imports privados entre módulos | Exportaciones públicas explícitas; contratos de dominio/tipos y middleware auth documentados |
| Ciclo entre edición service/repository | Planner inyectado mediante contrato, revalidado dentro de la transacción original |

Se conserva la organización física/digital del marketplace. No se crean un servicio
genérico de publicaciones, un ORM, un contenedor DI ni nuevas entidades de negocio.
Los [archivos trasladados, añadidos y retirados](REFACTOR_FILES.md) están inventariados.
Git identifica145 renombres,29 adiciones,5 eliminaciones y47 modificaciones antes
de añadir estos cuatro documentos; esas categorías incluyen pruebas y consumidores.

## Decisiones relevantes

- Preservar firmas públicas HTTP, sobres, status/códigos de error, cuotas y el
  momento de autenticación anterior al procesamiento de uploads.
- Un solo serializador admite las dos firmas internas existentes de `sendSuccess`.
  `sendError` y `sendApiError` son nombres de una misma función.
- Mantener clientes/pools compartidos y las relecturas de estado/permisos bajo lock.
  Exportar capacidades transaccionales no crea una segunda transacción.
- Conservar decisiones aprobadas: ADMINISTRADOR con capacidades en su campus,
  biblioteca digital institucional entre sedes, historial propio y ocultamiento
  operacional de actividades con creador trasladado/inactivo.
- Mantener separación entre lectura operacional, auditoría y snapshots históricos.
  La moderación SQL/Mongo conserva su recuperación durable; no se añade atomicidad distribuida.
- Conservar la migración005 exactamente. Sus imports antiguos funcionan mediante
  cuatro reexports mínimos documentados en [ARCHITECTURE.md](ARCHITECTURE.md).
- No convertir la ejecución CommonJS vigente a ESM estricto: se preservan
  NodeNext, sintaxis import/export, extensiones `.js` y despliegue actual.

## Validación ejecutada

Runtime de validación: **Node22.23.3**, dentro del rango declarado del backend.

| Validación | Resultado |
| --- | --- |
| Baseline typecheck/build | Correctos |
| Baseline suite existente | 738 casos:736 aprobados,0 fallos,2 Redis omitidos |
| `npm run typecheck` final | Correcto |
| `npm run build` final | Correcto; también se eliminó únicamente el dist generado y se reconstruyó desde cero |
| `npm test` final | 744 casos:742 aprobados,0 fallos,2 Redis omitidos |
| `npm run check:architecture` |195 archivos; imports resueltos, sin ciclos runtime ni infracciones comprobadas de capas/límites públicos |
| QA fixtures |3/3 aprobados |
| `node qa/seed.mjs check` | Correcto, solo lecturas reales de PostgreSQL/MongoDB/Storage y catálogos; sin seed ni modificación de datos |
| Preservación de rutas |147 declaraciones locales de método/ruta, incluidos montajes, iguales en10archivos; no equivale a147 endpoints finales |
| Literales de persistencia |277 argumentos literales de query/collection/from/rpc iguales a la base |
| Otros literales |696 declaraciones conservan sus literales; extracciones de routers/notificaciones revisadas aparte |
| Áreas excluidas | Sin diff en frontend, Docker, package-lock y migraciones SQL/Mongo históricas |

Las pruebas cubren HTTP Express, permisos/campus/estados, RLS y SQL con PGlite,
participación/edición/series Mongo con dobles de prueba, workers, notificaciones,
archivos PDF/Excel, denuncias y recuperación de moderación. Las seis pruebas nuevas
verifican arquitectura y arranque/readiness/fallos/cierre. El comprobador incluye
casos negativos de ciclo por import dinámico y acceso a implementación privada.

La comparación de literales/rutas complementa las pruebas; no constituye una
demostración de equivalencia de todos los estados o ejecuciones posibles.

## Problemas detectados y corregidos

1. El primer script de movimientos trató algunos literales de auditoría como
   imports. Se restauraron los valores originales, se restringió a nodos AST de
   import/export y pasaron las95 pruebas de auditoría/accesos repetidas.
2. Dos pruebas conservaban imports de funciones después de extraer repositorios:
   `joinedActivitiesPipeline` y `countActivityInteractions`. Se corrigieron los
   imports conservando las aserciones.
3. El análisis inicial ad hoc de ciclos tenía una colisión de nombres en su
   recorrido. El comprobador independiente detectó el ciclo preexistente de edición;
   se corrigió mediante inyección del planner, sin retirar su control transaccional.

## Límites y pendientes de entorno

- Docker Desktop no estaba ejecutándose en la validación final. No se pudo levantar
  Redis efímero y los dos casos con `F22_REDIS_TEST_URL` permanecen omitidos. El
  algoritmo Redis no cambia; no se presenta como validado con servidor real en esta entrega.
- Para ejecutar esos casos, proporcionar un Redis **aislado para QA** y ejecutar:

  ```powershell
  $env:F22_REDIS_TEST_URL = 'redis://127.0.0.1:6379'
  npm test
  Remove-Item Env:F22_REDIS_TEST_URL
  ```

- No se reconstruyó ni desplegó Docker en esta sesión. La reconstrucción limpia
  Node y el diagnóstico de solo lectura sí se ejecutaron; Dockerfile/Compose no cambian.
- No se certifican todos los flujos de negocio contra servicios remotos ni en
  dispositivos Expo. La suite usa HTTP real/PGlite y dobles Auth/Mongo; el check real
  acredita disponibilidad/lecturas, no una QA remota completa.
- El comprobador cubre imports estáticos y dinámicos literales. Cargas construidas
  mediante variables, `require` calculado o código generado requieren revisión.
- El Mermaid está trazado contra el código y sincronizado con ARCHITECTURE.md;
  no se instaló un motor Mermaid adicional para renderizarlo localmente.
- No se resuelven nuevas reglas funcionales pendientes del backlog. La propuesta
  de retención/sobrescritura F2.5-09 queda fuera del alcance.

## Commits de implementación

| SHA | Etapa |
| --- | --- |
|7d86cb1|Shared y transporte|
|50b6bba|Auth y validadores|
|2443299|Users y persistencia|
|923cbe9|Maps|
|e48074c|Activities por capas|
|0eeee73|Compatibilidad de la migración histórica|
|9464406|Analytics y repositorios|
|8ed752d|Reports/moderación|
|8a66e44|Marketplace común y físico|
|860f253|Biblioteca digital|
|af8d613|APIs públicas, ciclo de edición y comprobaciones|

El contexto diario, logs, comparadores e inventarios técnicos quedan en
`context/tasks/LOCAL-20261030-backend-modular-refactor/`, bajo la política local
ignorada del repositorio. Los documentos de esta entrega sí están versionados.
