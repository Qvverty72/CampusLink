# Task Context

## Task

**ID:** ENDPOINTS-MONGO
**Title:** Active campus map endpoint backed by MongoDB Atlas
**GitHub URL:** Not available; task identified from branch `brian/endpoints-mongo` and the user request.
**Status:** Completed
**Started:** 2026-09-23
**Last updated:** 2026-09-23

## Objective

Expose `GET /api/v1/maps/:campusId/active` so the backend returns the active campus map stored in MongoDB Atlas.

## Scope

- Reuse the backend's existing shared MongoDB driver connection.
- Add the maps route, controller, service, repository, and minimal document types.
- Preserve the existing health endpoint, Supabase integration, frontend, and campus-map seed.
- Document the MongoDB environment variable names without credentials.

## Acceptance Criteria

- `GET /api/v1/maps/:campusId/active` queries `campus_maps` by `campusId` and `status: 'ACTIVE'`.
- A found map returns HTTP 200 and the MongoDB document as JSON.
- A missing map returns HTTP 404 with `{ "error": "Active campus map not found" }`.
- A malformed campus ID returns HTTP 400.
- Unexpected errors are logged server-side and return HTTP 500 with `{ "error": "Internal server error" }`.
- `GET /api/v1/health` continues to work.
- `npm run typecheck` passes.

## Related Context

- `backendclink/src/database/mongodb/client.ts` owns the shared `MongoClient` lifecycle.
- `backendclink/src/database/mongodb/001_create_collections.mongosh.js` defines the `campus_maps` validator and active-map uniqueness index.
- `backendclink/scripts/seedCampusMapFromFloors.ts` creates the seeded map document and must remain unchanged.
- `backendclink/MONGODB_CONNECTION.md` documents the existing MongoDB architecture.
- `context/PRODUCT_VISION.md` and `context/BUSINESS_RULES.md` were not present when this task started, so no canonical business-rule IDs were available to reference.

## Development Log

### 2026-09-23

#### Objective

Implement and validate the first production endpoint that reads the active campus map from MongoDB Atlas.

#### Work completed

Completed repository and task-context discovery. Confirmed that the maps module files were empty placeholders, the official `mongodb` dependency was already installed, the seed and collection validator exist, and the server already connects through the shared client in `src/database/mongodb/client.ts`.

Implemented `GET /api/v1/maps/:campusId/active` through the maps router, controller, service, and repository. The repository queries `campus_maps` with the exact filter `{ campusId, status: 'ACTIVE' }`. The controller validates the UUID-shaped campus ID and implements the requested 200, 404, and 500 responses.

Removed the parallel-client behavior from `src/config/mongodb.ts`; its `getMongoDb` export now delegates to the shared database accessor. `MONGODB_DB_NAME` now defaults to `campuslink`, and `.env.example` documents only the two MongoDB variables requested.

#### Files modified

- `.gitignore`
- `backendclink/.env.example`
- `backendclink/src/config/env.ts`
- `backendclink/src/config/mongodb.ts`
- `backendclink/src/modules/maps/map.controller.ts`
- `backendclink/src/modules/maps/map.repository.ts`
- `backendclink/src/modules/maps/map.routes.ts`
- `backendclink/src/modules/maps/map.service.ts`
- `backendclink/src/modules/maps/map.types.ts`
- `backendclink/src/routes/index.ts`
- `context/TASK_INDEX.md`
- `context/tasks/ENDPOINTS-MONGO-active-campus-map/CONTEXT.md`
- `context/tasks/ENDPOINTS-MONGO-active-campus-map/SUMMARY.md`

#### Technical decisions

- The existing shared client in `src/database/mongodb/client.ts` is the canonical MongoDB connection because it is already used by server startup and explicitly documented for repository access.
- `src/config/mongodb.ts` remains as a compatibility facade exposing `getMongoDb`, but it no longer creates or owns a `MongoClient`.
- The map types intentionally model only the fields needed at this checkpoint; MongoDB returns the complete stored document at runtime.
- Basic campus validation uses the same canonical UUID shape and version/variant constraints as the existing collection validator.
- Unexpected errors log the campus ID and error class, not connection strings or MongoDB internals.
- The task uses the stable branch-derived ID `ENDPOINTS-MONGO` because no GitHub Issue number or existing task context is available.

#### Tests and validation

- `npm.cmd run typecheck` passed with no TypeScript errors.
- An isolated application startup verified `GET /api/v1/health` returns HTTP 200 with `{ "status": "ok" }`.
- The same route check verified malformed campus IDs return HTTP 400 with `{ "error": "Invalid campusId" }`.
- `npm.cmd run dev` compiled and attempted the configured Atlas connection, but this environment could not resolve the Atlas SRV record and exited with `querySrv ETIMEOUT`. Therefore, the live 200 response against Atlas was not verified here.

#### Problems or blockers

- Canonical product-memory files are absent from the repository, so no business-rule IDs could be referenced.
- Live Atlas validation is blocked in this environment by DNS SRV resolution timeout.

#### Pending work

None for this checkpoint. A developer with Atlas network access should perform the final live request.

#### Next recommended step

Run the backend locally where the Atlas SRV record resolves, then open `http://localhost:3000/api/v1/maps/22222222-2222-4222-8222-222222222222/active` and confirm the seeded document is returned.
