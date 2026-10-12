import { before, after, mock } from 'node:test';
import { activityIntegrity } from '../../src/modules/activities/activities.integrity.js';
import { requireCampusCapability } from '../../src/modules/auth/auth.authorization.js';

// Existing F2.6 unit suites own their documents/auth fixtures. Keep infrastructure
// isolated while retaining authorization; real SQL/reference checks have dedicated suites.
before(() => {
  mock.method(activityIntegrity, 'isVisible', async () => true);
  mock.method(activityIntegrity, 'withActor', async (auth, capability, operation) => {
    requireCampusCapability(auth, auth.campusId, capability);
    return operation(auth, '1970-01-01T00:00:00.000000Z');
  });
});
after(() => mock.restoreAll());
