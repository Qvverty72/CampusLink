import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('account search transport encodes literal name/email with campus, page and abort while preserving unfiltered requests', async () => {
  const code=ts.transpileModule(fs.readFileSync(new URL('../src/features/users/api/accessApi.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const calls=[],module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,URLSearchParams,require(name){assert.equal(name,'@/lib/api/authenticated-request');return {
    authenticatedEnvelopeRequest:async(...args)=>{calls.push(args);return {data:[],meta:{page:2,limit:20,hasMore:true,total:45}}},authenticatedRequest:()=>{},
  }}});
  const signal=new AbortController().signal;
  const result=await module.exports.loadAccessUsers('campus/id',2,signal,'  Camila+test & correo@duocuc.cl  ');
  assert.equal(result.meta.total,45);assert.equal(result.meta.page,2);assert.equal(result.meta.limit,20);
  assert.equal(calls[0][0],'/api/v1/users/access/campuses/campus%2Fid/users');assert.equal(calls[0][1].signal,signal);
  assert.equal(calls[0][2].get('q'),'Camila+test & correo@duocuc.cl');assert.equal(calls[0][2].get('page'),'2');assert.equal(calls[0][2].get('limit'),'20');
  for(const query of [undefined,'   '])await module.exports.loadAccessUsers('campus/id',1,signal,query);
  assert.equal(calls[1][2].toString(),'page=1&limit=20');assert.equal(calls[2][2].toString(),'page=1&limit=20');
});
