import test from 'node:test';
import assert from 'node:assert/strict';
import {newManifest,resourcePlan,activityDates,DAY,assertOwned,pdfFixture,pngFixture} from '../fixtures.mjs';
import {inflateSync} from 'node:zlib';
import {PDFDocument} from 'pdf-lib';
test('plan conserva aislamiento, volumen para paginar e identidades locales',()=>{
 const m=newManifest(new Date('2026-10-21T12:00:00Z'));
 assert.equal(m.users.length,10);assert.equal(new Set(m.users.map(u=>u.id)).size,10);
 for(const kind of ['physical','digital']){const p=resourcePlan(kind);assert.equal(p.filter(r=>r.n<=21&&r.campus===0).length,21);assert.equal(p.at(-2).owner,6);assert.equal(p.at(-1).owner,7);}
 assert.equal(resourcePlan('physical').length,28);assert.equal(resourcePlan('digital').length,26);
 const dates=activityDates(m.t0,7);assert.equal(Date.parse(dates.startAt)-Date.parse(m.t0),7*DAY);assert.ok(dates.endAt>dates.startAt);
 assert.throws(()=>assertOwned(m,['foreign'],m.users.map(u=>u.id)));assertOwned(m,[m.users[0].id],m.users.map(u=>u.id));
});
test('PDFs reales y distintos, varias páginas sin datos personales',async()=>{
 const a=await pdfFixture(),b=await pdfFixture('Material QA',true);
 assert.equal((await PDFDocument.load(a)).getPageCount(),2);assert.notDeepEqual(a,b);assert.ok(a.length<26214400);
});
test('PNG tiene CRC correctos y datos de imagen descomprimibles',()=>{
 const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 let offset=8;const image=[];while(offset<pngFixture.length){const n=pngFixture.readUInt32BE(offset),type=pngFixture.toString('ascii',offset+4,offset+8);assert.equal(crc(pngFixture.subarray(offset+4,offset+8+n)),pngFixture.readUInt32BE(offset+8+n));if(type==='IDAT')image.push(pngFixture.subarray(offset+8,offset+8+n));offset+=12+n;}assert.equal(inflateSync(Buffer.concat(image)).length,64*(1+64*3));
});
