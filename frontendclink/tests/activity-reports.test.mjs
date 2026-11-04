import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';

function load(path, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, URLSearchParams,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  return module.exports;
}
const activityId = '1234567890abcdef12345678', campusId = 'campus-a';
const receipt = { id: '12345678-1234-1234-1234-123456789abc', campusId, activityId,
  status: 'RESUELTO', reason: 'ACTIVITY_OTHER', description: 'Mi descripción', reportedAt: '2026-10-21T12:00:00Z' };

test('activity own/submit transport accepts original resolved receipts and validates identity, status and private fields', async () => {
  let data = receipt; const calls = [];
  const api = load('../src/features/reports/api/reportsApi.ts', {
    '@/lib/api/authenticated-request': { authenticatedEnvelopeRequest: async (...args) => { calls.push(args); return { data }; } },
  });
  const signal = new AbortController().signal;
  assert.equal(await api.fetchOwnActivityReport(campusId, activityId, signal), receipt);
  assert.equal(calls[0][0], `/api/v1/reports/activities/${activityId}/own`); assert.equal(calls[0][1].signal, signal);
  const input = { reason: 'ACTIVITY_SPAM' };
  assert.equal(await api.submitActivityReport(campusId, activityId, input, signal), receipt);
  assert.equal(calls[1][1].method, 'POST'); assert.deepEqual(JSON.parse(calls[1][1].body), input);
  data = null; assert.equal(await api.fetchOwnActivityReport(campusId, activityId), null);
  for (const patch of [{ campusId: 'other' }, { activityId: 'f'.repeat(24) }, { status: 'UNKNOWN' },
    { reason: undefined }, { description: undefined }, { reportedAt: 'invalid' }]) {
    data = { ...receipt, ...patch };
    await assert.rejects(api.fetchOwnActivityReport(campusId, activityId));
  }
});

class AuthApiError extends Error { constructor(status) { super(); this.status = status; } }
test('publication own-receipt transport verifies target, origin campus and persisted metadata for both domains',async()=>{
 const publicationId='12345678-1234-1234-1234-123456789abc',origin='origin-campus',calls=[];let data=null;
 const api=load('../src/features/reports/api/reportsApi.ts',{'@/lib/api/authenticated-request':{authenticatedEnvelopeRequest:async(...args)=>{calls.push(args);return {data};}}});
 for(const type of ['PUBLICACION_FISICA','PUBLICACION_DIGITAL']){
  const target={type,publicationId,campusId:origin},expected=type==='PUBLICACION_DIGITAL'?origin:campusId;
  data=null;assert.equal(await api.fetchOwnPublicationReport(campusId,target),null);assert.ok(calls.at(-1)[0].includes(type==='PUBLICACION_DIGITAL'?'/elibrary/':'/physicalgoods/'));
  const own={id:publicationId,campusId:expected,publicationId,transactionId:null,status:'RESUELTO',reportedAt:receipt.reportedAt,reason:'Original',description:'Comentario'};
  data=own;assert.equal(await api.fetchOwnPublicationReport(campusId,target),own);
  for(const patch of [{campusId:'other'},{publicationId:'other'},{transactionId:publicationId},{status:'UNKNOWN'},{reason:''},{description:{}},{reportedAt:'bad'}]){data={...own,...patch};await assert.rejects(api.fetchOwnPublicationReport(campusId,target));}
 }
});

function harness(target = { type: 'ACTIVIDAD', activityId }) {
  const slots = [], calls = { lookups: [], submits: [], physical: [],publications:[],digital:[] }; let cursor = 0, effects = [], refreshes = 0;
  const auth = { identity: { userId: 'user-a', campusId }, session: {}, refreshIdentity() { refreshes++; } };
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(effect, deps) { const i = cursor++, old = slots[i];
      if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) effects.push(() => {
        old?.cleanup?.(); slots[i] = { deps, cleanup: effect() };
      }); },
  };
  const pending = (bucket, args) => new Promise((resolve, reject) => bucket.push({ args, resolve, reject }));
  const { useContentReport } = load('../src/features/reports/hooks/useContentReport.ts', {
    react, '@/features/auth/hooks/useAuth': { useAuth: () => auth },
    '@/lib/api/authenticated-request': { AuthApiError },
    '../api/reportsApi': {
      fetchOwnActivityReport: (...args) => pending(calls.lookups, args),
      fetchOwnPublicationReport:(...args)=>pending(calls.publications,args),
      submitActivityReport: (...args) => pending(calls.submits, args),
      submitPhysicalgoodsReport: (...args) => pending(calls.physical, args),
      submitDigitalReport:(...args)=>pending(calls.digital,args),
    },
  });
  return { auth, calls, get refreshes() { return refreshes; },
    render() { cursor = 0; const result = useContentReport(target); const work = effects; effects = []; work.forEach(fn => fn()); return result; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('reopening a reported activity recovers the persisted confirmation and blocks repeat submission', async () => {
  const h = harness(); let state = h.render();
  await state.submit({ reason: 'ACTIVITY_SPAM' }); assert.equal(h.calls.submits.length, 0);
  h.calls.lookups[0].resolve(receipt); await setImmediate(); state = h.render();
  assert.equal(state.receipt, receipt); assert.equal(state.checking, false);
  await state.submit({ reason: 'ACTIVITY_SPAM' }); assert.equal(h.calls.submits.length, 0);
  h.unmount();
});

test('failed lookup stays closed to submission, retries explicitly and discards responses from another account', async () => {
  const h = harness(); h.render(); h.calls.lookups[0].reject(new AuthApiError(403));
  await setImmediate(); let state = h.render(); assert.ok(state.lookupError); assert.equal(h.refreshes, 1);
  await state.submit({ reason: 'ACTIVITY_SPAM' }); assert.equal(h.calls.submits.length, 0);
  state.retryLookup(); h.render(); const oldLookup = h.calls.lookups.at(-1);
  h.auth.identity = { userId: 'user-b', campusId }; state = h.render();
  assert.equal(state.receipt, null); assert.equal(oldLookup.args[2].aborted, true);
  oldLookup.resolve(receipt); await setImmediate(); assert.equal(h.render().receipt, null);
  h.calls.lookups.at(-1).resolve(null); await setImmediate(); state = h.render();
  const send = state.submit({ reason: 'ACTIVITY_OTHER' });
  void state.submit({ reason: 'ACTIVITY_SPAM' }); assert.equal(h.calls.submits.length, 1);
  h.calls.submits[0].resolve(receipt); await send; assert.equal(h.render().receipt, receipt);
  h.unmount();
});

test('physical report submission requires a successful own-publication lookup and blocks repeats', async () => {
  const h = harness({ type: 'PUBLICACION_FISICA', publicationId: 'publication-a' }); let state = h.render();
  assert.equal(h.calls.lookups.length, 0); assert.equal(state.checking, true);await state.submit({reason:'Motivo'});assert.equal(h.calls.physical.length,0);
  h.calls.publications[0].resolve(null);await setImmediate();state=h.render();const send = state.submit({ reason: 'Motivo libre' });
  assert.equal(h.calls.physical.length, 1); h.calls.physical[0].resolve(receipt); await send;
  assert.equal(h.render().receipt, receipt); h.unmount();
});

test('publication reports recover a persisted status in both domains and discard another account response',async()=>{
 for(const type of ['PUBLICACION_FISICA','PUBLICACION_DIGITAL']){
  const h=harness({type,publicationId:'publication-a',campusId:'origin'});let state=h.render();const stale=h.calls.publications[0];
  h.auth.identity={userId:'user-b',campusId};state=h.render();assert.equal(stale.args[2].aborted,true);stale.resolve(receipt);await setImmediate();assert.equal(h.render().receipt,null);
  h.calls.publications.at(-1).reject(new Error('offline'));await setImmediate();state=h.render();assert.ok(state.lookupError);await state.submit({reason:'other'});assert.equal(h.calls.physical.length+h.calls.digital.length,0);
  state.retryLookup();h.render();const saved={...receipt,status:'RESUELTO',reason:'Original',description:'Comentario'};h.calls.publications.at(-1).resolve(saved);await setImmediate();state=h.render();assert.equal(state.receipt,saved);await state.submit({reason:'changed'});assert.equal(h.calls.physical.length+h.calls.digital.length,0);h.unmount();
 }
});
