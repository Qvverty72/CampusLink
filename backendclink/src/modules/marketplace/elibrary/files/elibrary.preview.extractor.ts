import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { ApiError } from '../../../../shared/errors/api-error.js';

let running = 0;
const script = `
const {parentPort,workerData}=require('node:worker_threads');
(async()=>{
  let task;
  try {
    const {getDocument}=await import(workerData.moduleUrl);
    task=getDocument({data:new Uint8Array(workerData.bytes),isEvalSupported:false,disableFontFace:true,
      useSystemFonts:false,useWorkerFetch:false,disableAutoFetch:true,disableStream:true,disableRange:true,
      maxImageSize:0,stopAtErrors:true,verbosity:0});
    const doc=await task.promise,page=await doc.getPage(1);
    const reader=page.streamTextContent().getReader(); let text='';
    try { while(text.length<800) { const {done,value}=await reader.read();if(done)break;
      for(const item of value.items) if(typeof item.str==='string') {text+=(text?' ':'')+item.str.slice(0,800-text.length);if(text.length>=800)break;}
    }} finally {await reader.cancel().catch(()=>{});}
    text=text.replace(/[\\u0000-\\u001f\\u007f]/g,' ').trim();
    parentPort.postMessage(text.length<100?null:text.slice(0,Math.min(400,Math.floor(text.length/2))));
  }catch{parentPort.postMessage(null);}finally{await task?.destroy().catch(()=>{});parentPort.close();}
})();`;

/** El cliente no elige páginas ni offsets; nunca recibe el PDF original ni una página PDF reutilizable. */
export async function extractDigitalPreview(bytes: Buffer): Promise<string | null> {
  if (running >= 2) throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','La vista previa está ocupada. Inténtalo nuevamente.');
  running++;
  let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<string | null>((resolve, reject) => {
      worker = new Worker(script, { eval: true, env: {}, stdout: true, stderr: true,
        resourceLimits: { maxOldGenerationSizeMb: 128 }, workerData: { bytes, moduleUrl: pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href } });
      // Las advertencias del parser pueden contener metadatos privados del documento.
      worker.stdout?.resume(); worker.stderr?.resume();
      timer = setTimeout(() => reject(new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudo preparar la vista previa.')),8000);
      worker.once('message', value => resolve(typeof value === 'string' && value.length <= 400 ? value : null));
      worker.once('error', () => resolve(null));
      worker.once('exit', () => resolve(null));
    });
  } finally { if (timer) clearTimeout(timer); await worker?.terminate(); running--; }
}
