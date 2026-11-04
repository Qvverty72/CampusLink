import {randomUUID, randomBytes} from 'node:crypto';
import {PDFDocument, StandardFonts} from 'pdf-lib';

export const DAY = 86400000;
export const actors = ['admin','eventos','consulta','publicador','receptor','nuevo','otra-sede','otra-institucion','suspendido','desactivado'];
export function newManifest(now = new Date()) {
  const runId = 'QA-' + now.toISOString().replace(/\D/g,'').slice(0,14) + '-' + randomBytes(3).toString('hex');
  return {version:1,runId,t0:now.toISOString(),institutions:[randomUUID(),randomUUID()],campuses:[randomUUID(),randomUUID(),randomUUID()],careers:[randomUUID(),randomUUID()],subjects:Array.from({length:4},randomUUID),users:actors.map((actor,index)=>({actor,id:randomUUID(),email:`${actor}.${runId.toLowerCase()}@campuslink.invalid`,password:randomBytes(24).toString('base64url')+'Az1!',campus:index===6?1:index===7?2:0})),steps:{},publications:[],activities:[],maps:[],objects:[],transactions:[]};
}
export function resourcePlan(kind) {
  const total=kind==='physical'?28:26;
  return Array.from({length:total},(_,index)=>{
    const n=index+1;
    return {key:`${kind}-${String(n).padStart(2,'0')}`,n,kind,owner:n===21?4:n===total-1?6:n===total?7:kind==='digital'&&n===24?9:3,campus:n===total-1?1:n===total?2:0,modality:n%2?'VENTA':'DONACION'};
  });
}
export function activityDates(t0,day=7,duration=2*3600000) {
  const start=new Date(new Date(t0).getTime()+day*DAY);
  return {startAt:start.toISOString(),endAt:new Date(start.getTime()+duration).toISOString()};
}
export async function pdfFixture(label='Material QA',second=false) {
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
  doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  const page=doc.addPage([595,842]);
  page.drawText(label,{x:45,y:780,size:18,font});
  for(let i=0;i<20;i++)page.drawText(`Unidad ${second?'2':'1'} - Ejercicio ${i+1}: material ficticio para QA.`,{x:45,y:740-i*24,size:11,font});
  doc.addPage().drawText('Segunda pagina: original completo de prueba.',{x:45,y:750,size:12,font});
  return Buffer.from(await doc.save());
}
// PNG completo, pequeño y válido. El backend genera rutas y URLs firmadas.
export const pngFixture=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAb0lEQVR4nO3P0QmAMBAFwfRkO+m/jdiDCazKHO/3YGeMa357fQFAXQBQFwDUBQB1AUBdAFAXANQFAA8/1+kDAAAAAAAAAAAAAAAAAAAAAAAAAAAA+D/gLesLAOoCgLoAoC4AqAsA6gKAugCgLtjbDZC04pcdGUcAAAAAAElFTkSuQmCC','base64');
export function assertOwned(manifest,ids,expected) {
  if (!Array.isArray(ids)||ids.some(id=>!expected.includes(String(id)))) throw new Error('Referencias ajenas al manifiesto: limpieza detenida');
  if (!manifest.runId.startsWith('QA-')) throw new Error('Manifiesto QA invalido');
}
