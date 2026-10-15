import { dispatchPhysicalgoodsReminders } from './physicalgoods.reminders.service.js';

/** Sigue el patrón de mantenimiento existente: tanda al iniciar, sin solapamiento y cierre que espera la ejecución. */
export function startPhysicalgoodsReminderWorker(dispatch=dispatchPhysicalgoodsReminders):()=>Promise<void> {
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
  let running:Promise<void>;
  const run=async()=>{
    try {
      const result=await dispatch(()=>stopped);
      if(result.failed)console.error('Physical publication reminder delivery unavailable; pending publications retained');
    } catch {console.error('Physical publication reminder check unavailable');}
    if(!stopped){timer=setTimeout(()=>{running=run();},60_000);timer.unref();}
  };
  running=run();
  return async()=>{stopped=true;if(timer)clearTimeout(timer);await running;};
}
