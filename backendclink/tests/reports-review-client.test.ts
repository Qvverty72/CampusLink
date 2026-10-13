import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isReviewDetail, isReviewPage } from '../../frontendclink/src/features/reports/types/review.js';

const campus = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222';
const person = '33333333-3333-4333-8333-333333333333';
const entry = { id, campusId:campus, targetType:'ACTIVIDAD', targetId:'abcdef012345678901234567',
  title:'Actividad original', reason:'Motivo privado', status:'PENDIENTE', reportedAt:'2026-10-13T12:00:00Z' };
const detail = { ...entry, description:null,reporter:{id:person,name:'Denunciante'},snapshot:{title:'Original'},
  current:null,participants:[],activityChanges:[] };

test('review client refuses detail for another campus/report and malformed evidence or people before display', () => {
  assert.equal(isReviewDetail(detail,campus,id),true);
  assert.equal(isReviewDetail(detail,id,id),false);
  assert.equal(isReviewDetail(detail,campus,campus),false);
  for (const patch of [{campusId:id},{id:person},{snapshot:[]},{current:[]},{reporter:{id:'invalid',name:'Test'}},
    {participants:[{id:'invalid',name:'Test'}]},{activityChanges:[null]},{status:'UNKNOWN'},{reportedAt:'invalid'},
    {targetType:'VALORACION'}, {reporter:null}]) assert.equal(isReviewDetail({...detail,...patch},campus,id),false);
  assert.equal(isReviewDetail(null,campus,id),false);
});
test('review client refuses mixed-campus or stale pagination results and only accepts the requested page', () => {
  const result = {data:[entry],meta:{page:2,limit:20,hasMore:false}};
  assert.equal(isReviewPage(result,campus,2),true);
  assert.equal(isReviewPage(result,campus,1),false);
  assert.equal(isReviewPage({...result,data:[entry,{...entry,campusId:id}]},campus,2),false);
  assert.equal(isReviewPage({...result,meta:{page:2,limit:100,hasMore:false}},campus,2),false);
  assert.equal(isReviewPage({...result,meta:{page:2,limit:20,hasMore:'false'}},campus,2),false);
});
