import {useEffect,useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {Archive,ArrowLeft,BookOpen,FileText,Files,Pencil,Tags} from 'lucide-react-native';
import {Skeleton,SkeletonBlock} from '@/components/Skeleton';
import {AgreementStepModal} from '../../components/AgreementStepModal';
import {CATALOG_COLORS as c} from '../../components/CatalogUI';
import {ManagementAction,publicationManagementUI as s} from '../../components/PublicationManagementUI';
import {PublicationFeedback,PublicationSection,PublicationSubmit} from '../../components/PublicationFormUI';
import {RequestButton} from '../../components/RequestsUI';
import type {useDigitalLibrary} from '../hooks/useDigitalLibrary';
import {DigitalAcademicSelector} from './DigitalAcademicSelector';
import {DigitalPublicationEditor} from './DigitalPublicationEditor';

type Mode='overview'|'edit'|'files'|'academics'|'withdraw';
const titles:Record<Mode,string>={overview:'Administrar publicación',edit:'Editar publicación',files:'Archivos de la publicación',academics:'Clasificación académica',withdraw:'Retirar publicación'};

/** Navegación visual compartida con físicos; las operaciones siguen siendo digitales. */
export function DigitalPublicationManagement({library:l,onClose,onBusyChange}:{library:ReturnType<typeof useDigitalLibrary>;onClose:()=>void;onBusyChange?:(busy:boolean)=>void}){
 const [mode,setMode]=useState<Mode>('overview'),[editorBusy,setEditorBusy]=useState(false),[openingAcademics,setOpeningAcademics]=useState(false),[feedback,setFeedback]=useState<string|null>(null);
 const opening=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const resource=l.detail,busy=l.busy||Boolean(l.downloading)||editorBusy||openingAcademics;
 const available=Boolean(resource&&l.isOwner&&!resource.isWithdrawn&&resource.status==='DISPONIBLE'),blocked=busy||!available;
 useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
 const back=()=>{if(busy||opening.current)return;l.cancelAcademics();setFeedback(null);setMode('overview');};
 const close=()=>{if(busy||opening.current)return;l.cancelAcademics();onClose();};
 async function choose(next:Mode){
  if(blocked||opening.current)return;
  setFeedback(null);setMode(next);
  if(next==='academics'){
   opening.current=true;setOpeningAcademics(true);
   try{await l.openAcademicEditor();}finally{opening.current=false;if(mounted.current)setOpeningAcademics(false);}
  }
 }
 async function saveAcademics(){if(blocked||!l.editingAcademics)return;if(await l.saveAcademics()){setMode('overview');setFeedback('La clasificación académica se guardó.');}}
 return <AgreementStepModal title={titles[mode]} closeLabel="Cerrar administración de publicación digital" onClose={close} closeDisabled={busy} fillHeight keyboardAvoiding contentKey={mode} contentStyle={s.content}>
  {mode!=='overview'&&<Pressable accessibilityRole="button" accessibilityLabel="Volver a opciones de publicación" disabled={busy} onPress={back} style={s.back}><ArrowLeft size={17} color={c.primary} aria-hidden/><Text style={s.backText}>Opciones de publicación</Text></Pressable>}
  {resource&&<View style={s.summary}><View accessible={false} aria-hidden style={s.resourceIcon}><BookOpen size={22} color={c.secondary}/></View><View style={s.identity}>
   <Text style={s.title}>{resource.title}</Text><Text style={s.helper}>{resource.isWithdrawn?'Desactivada':resource.status==='DISPONIBLE'?'Disponible':'No disponible'} · {resource.campusName}</Text>
   <Text style={s.amount}>{resource.modality==='DONACION'?'Donación':`$${resource.price?.toLocaleString('es-CL')} CLP`}</Text>
  </View></View>}
  <PublicationFeedback notice={feedback} error={l.error}/>
  {!available?<Text style={s.body}>Esta publicación ya no está disponible para administrar desde tu contexto actual. Sus archivos e historial se conservan.</Text>:<>
   {mode==='overview'&&<View style={s.options}>
    <Text style={s.helper}>Elige qué quieres cambiar en tu publicación.</Text>
    <ManagementAction icon={Pencil} title="Editar datos" description="Nombre, descripción, modalidad y precio." disabled={blocked} onPress={()=>void choose('edit')}/>
    <ManagementAction icon={Files} title="Gestionar archivos" description={`${resource!.files.length} archivo${resource!.files.length===1?'':'s'} publicado${resource!.files.length===1?'':'s'} · Añadir o descargar material.`} disabled={blocked} onPress={()=>void choose('files')}/>
    <ManagementAction icon={Tags} title="Clasificación académica" description="Revisa las carreras y asignaturas de tu recurso." disabled={blocked} onPress={()=>void choose('academics')}/>
    <View style={s.withdrawOption}><ManagementAction icon={Archive} title="Retirar publicación" description="Dejará de aparecer en la Biblioteca." danger disabled={blocked} onPress={()=>void choose('withdraw')}/></View>
   </View>}
   {(mode==='edit'||mode==='withdraw')&&<DigitalPublicationEditor key={mode} mode={mode} resource={resource!} onBusyChange={setEditorBusy} onClose={back} onSaved={value=>{l.savedContent(value);if(!value.isWithdrawn){setMode('overview');setFeedback('Los cambios se guardaron.');}}}/>}
   {mode==='files'&&<>
    <View style={s.card}><Text accessibilityRole="header" style={s.sectionTitle}>Archivos publicados · {resource!.files.length}</Text><Text style={s.helper}>Los originales permanecen privados. Tú y quienes adquieran el recurso pueden descargarlos.</Text>
     {resource!.files.map(file=><View key={file.id} style={{gap:10,paddingTop:12,borderTopWidth:1,borderColor:c.border}}><View style={{flexDirection:'row',gap:10,alignItems:'center'}}><FileText size={22} color={c.secondary} aria-hidden/><View style={s.identity}><Text style={s.title}>{file.name}</Text><Text style={s.helper}>{file.mimeType==='application/pdf'?'PDF':file.mimeType} · {file.sizeBytes<1024*1024?`${Math.max(1,Math.ceil(file.sizeBytes/1024))} KB`:`${(file.sizeBytes/1024/1024).toLocaleString('es-CL',{maximumFractionDigits:2})} MB`}</Text></View></View>
      <RequestButton label={l.downloading===file.id?'Descargando…':'Descargar archivo'} accessibilityLabel={`Descargar ${file.name}`} disabled={blocked} onPress={()=>{if(!blocked)void l.download(file);}}/>
     </View>)}
    </View>
    <View style={s.card}><Text accessibilityRole="header" style={s.sectionTitle}>Añadir archivos</Text><Text style={s.helper}>Uno o varios PDF de hasta 25 MB cada uno.</Text><PublicationSubmit label="Seleccionar archivos nuevos" disabled={blocked} onPress={()=>{if(!blocked)l.openAttachments();}}/><Text style={s.helper}>Los archivos publicados se conservan para quienes ya los adquirieron. Para ofrecer un original diferente, crea otra publicación.</Text></View>
   </>}
   {mode==='academics'&&(openingAcademics?<Skeleton label="Cargando clasificación académica" contentStyle={{gap:14}}><SkeletonBlock height={72}/><SkeletonBlock height={72}/></Skeleton>:l.editingAcademics?<>
    <PublicationSection number="1" title="Carreras y asignaturas" hint="Ayuda a que otros estudiantes encuentren tu material.">
     <DigitalAcademicSelector catalog={l.catalog} loading={l.catalogLoading} error={l.catalogError} reload={l.reloadCatalog} careerIds={l.careerIds} subjectIds={l.subjectIds} onCareersChange={l.setCareerIds} onSubjectsChange={l.setSubjectIds} disabled={blocked||l.academicConflict} previous={resource!}/>
    </PublicationSection>
    {l.academicConflict&&<View style={s.errorBox}><Text style={s.helper}>Recarga las asociaciones vigentes antes de volver a guardar. Se descartarán las selecciones de este formulario.</Text><RequestButton label="Recargar asociaciones vigentes" disabled={busy} onPress={()=>void choose('academics')}/></View>}
    <PublicationSubmit label={l.busy?'Guardando clasificación…':'Guardar clasificación'} busy={l.busy} disabled={blocked||l.academicConflict||l.catalogLoading||Boolean(l.catalogError)} onPress={()=>void saveAcademics()}/>
    <RequestButton label="Cancelar edición" disabled={busy} onPress={back}/>
   </>:<View style={s.card}><Text style={s.helper}>No se pudo abrir la clasificación académica.</Text><RequestButton label="Reintentar clasificación" disabled={busy} onPress={()=>void choose('academics')}/></View>)}
  </>}
 </AgreementStepModal>;
}
