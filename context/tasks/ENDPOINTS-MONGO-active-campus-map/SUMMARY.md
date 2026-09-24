# Technical Task Summary

## Task

**ID:** ENDPOINTS-MONGO
**Title:** Active campus map endpoint backed by MongoDB Atlas
**Status:** Completed
**Completed:** 2026-09-23
**GitHub URL:** Not available; task identified from branch `brian/endpoints-mongo` and the user request.

## Summary

The backend now exposes `GET /api/v1/maps/:campusId/active` and reads the matching active map from MongoDB Atlas through the existing shared official-driver connection.

## Implemented functionality

- Registered the maps module under `/api/v1/maps` without changing `/api/v1/health`.
- Added basic UUID validation for `campusId`.
- Returns the stored active map with HTTP 200.
- Returns the specified JSON errors for missing maps and unexpected failures.
- Added a MongoDB environment example without credentials.

## Technical implementation

The request enters `map.routes.ts`, is validated and translated to HTTP behavior in `map.controller.ts`, delegates through `map.service.ts`, and reaches `map.repository.ts`. The repository is the only maps-module layer that names the `campus_maps` collection and calls `findOne({ campusId, status: 'ACTIVE' })`.

The repository obtains its `Db` through `getMongoDb`, which is a facade over the existing `getMongoDB` accessor. Server startup and repository queries therefore share the single module-level `MongoClient` owned by `src/database/mongodb/client.ts`.

## Files created

- `backendclink/.env.example`
- `context/TASK_INDEX.md`
- `context/tasks/ENDPOINTS-MONGO-active-campus-map/CONTEXT.md`
- `context/tasks/ENDPOINTS-MONGO-active-campus-map/SUMMARY.md`

## Files modified

- `.gitignore`
- `backendclink/src/config/env.ts`
- `backendclink/src/config/mongodb.ts`
- `backendclink/src/modules/maps/map.controller.ts`
- `backendclink/src/modules/maps/map.repository.ts`
- `backendclink/src/modules/maps/map.routes.ts`
- `backendclink/src/modules/maps/map.service.ts`
- `backendclink/src/modules/maps/map.types.ts`
- `backendclink/src/routes/index.ts`

## Files removed

None.

## Important technical decisions

- Reused `src/database/mongodb/client.ts` as the sole connection owner rather than adding a second client or pool.
- Kept `src/config/mongodb.ts` as a one-line compatibility facade because it already existed and the requested maps structure can consume its `getMongoDb` name.
- Kept the service intentionally thin because this checkpoint has no additional business rules.
- Modeled only the stable top-level map fields needed now; the driver still returns the entire MongoDB document, including fields not exhaustively typed yet.
- Did not add the local seed's DNS override to application code.

## Interfaces and contracts

- Endpoint: `GET /api/v1/maps/:campusId/active`.
- MongoDB filter: `{ campusId, status: 'ACTIVE' }` against `campus_maps`.
- HTTP 200: complete stored map document.
- HTTP 400: `{ "error": "Invalid campusId" }` for a malformed campus ID.
- HTTP 404: `{ "error": "Active campus map not found" }`.
- HTTP 500: `{ "error": "Internal server error" }`.
- Environment: `MONGODB_URI` is required; `MONGODB_DB_NAME` defaults to `campuslink`.

## Dependencies

No dependencies were added. The implementation uses the already-installed official `mongodb` driver.

## Testing and validation

- `npm.cmd run typecheck` passed.
- An isolated app startup verified the existing health endpoint returns HTTP 200.
- The maps route returned HTTP 400 for a malformed campus ID, confirming route registration and controller validation.
- A real `npm.cmd run dev` attempt reached MongoDB initialization but failed on the environment's Atlas SRV lookup with `querySrv ETIMEOUT`; the live seeded document could not be queried from this environment.

## Known limitations

- Live Atlas success and not-found responses require a network environment that can resolve and reach the configured Atlas cluster.
- The map type is deliberately minimal and does not yet model nested buildings, floors, POIs, model metadata, or lifecycle timestamps exhaustively.
- Canonical `context/PRODUCT_VISION.md` and `context/BUSINESS_RULES.md` files were absent, so no business-rule IDs are attached to this task.

## Related tasks

- No prior task context was available. The preceding MongoDB persistence work is represented by commit `005464a` and `backendclink/MONGODB_CONNECTION.md`.

## Future modification guide

Start with:

- `backendclink/src/modules/maps/map.routes.ts` for URL changes.
- `backendclink/src/modules/maps/map.controller.ts` for HTTP validation and response behavior.
- `backendclink/src/modules/maps/map.service.ts` for future map business rules.
- `backendclink/src/modules/maps/map.repository.ts` for MongoDB queries.
- `backendclink/src/database/mongodb/client.ts` for shared connection lifecycle changes.

Do not create a new `MongoClient` inside the maps module. Extend `map.types.ts` only when downstream functionality needs stronger nested typing.

## Final state

CampusLink's backend can retrieve the single active map for a valid campus ID from the seeded `campus_maps` collection while preserving the existing health route and MongoDB connection lifecycle.
