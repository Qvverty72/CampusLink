import {useRef,useState} from 'react';
import {ActivityIndicator,Pressable,Text,View} from 'react-native';
import {Archive,ArrowLeft,Images,Package,Pencil,Tags} from 'lucide-react-native';
import {Skeleton,SkeletonBlock} from '@/components/Skeleton';
import {AgreementStepModal} from '../../components/AgreementStepModal';
import {CATALOG_COLORS as c} from '../../components/CatalogUI';
import {PublicationSubmit,PublicationUpload} from '../../components/PublicationFormUI';
import {ManagementAction,publicationManagementUI as s} from '../../components/PublicationManagementUI';
import {RequestButton} from '../../components/RequestsUI';
import {SearchableFilterSelect} from '../../components/SearchableFilterSelect';
import {useEditPhysicalgoods} from '../hooks/useEditPhysicalgoods';
import type {usePhysicalgoodsResources} from '../hooks/usePhysicalgoodsResources';
import {PHYSICALGOODS_MAX_IMAGES} from '../types/publication';
import {orderPhysicalgoodsCategories} from '../utils/orderPhysicalgoodsCategories';
import {PhysicalgoodsEditor} from './PhysicalgoodsEditor';
import {PublicationImages} from './PublicationImages';
import {PhysicalgoodsOriginalPrice} from './PhysicalgoodsPriceHistory';

type Mode='overview'|'edit'|'photos'|'category'|'withdraw';
const titles:Record<Mode,string>={overview:'Administrar publicación',edit:'Editar publicación',photos:'Fotos de la publicación',category:'Categoría de la publicación',withdraw:'Retirar publicación'};
const statusLabel=(value:string)=>({DISPONIBLE:'Disponible',RESERVADO:'Reservado',FINALIZADO:'Finalizado'}[value]??value);

/** Cada panel conserva la operación y los permisos de su contrato de dominio. */
export function PhysicalgoodsManagement({resources:r,onClose}:{resources:ReturnType<typeof usePhysicalgoodsResources>;onClose:()=>void}){
 const edit=useEditPhysicalgoods(r),[mode,setMode]=useState<Mode>('overview'),[categoryOpen,setCategoryOpen]=useState(false),[feedback,setFeedback]=useState<string|null>(null);
 const preview=useRef(r.gallery);if(r.gallery)preview.current=r.gallery;
 const resource=r.gallery??preview.current,drafts=r.draftImages??[];
 const blocked=r.busy||r.galleryLoading||!r.gallery?.canEdit;
 const ownerBlocked=blocked||!edit.canManage;
 const back=()=>{if(r.busy)return;edit.cancel();edit.setConfirm(false);setCategoryOpen(false);setFeedback(null);setMode('overview');};
 const choose=(next:Mode)=>{if(blocked)return;setFeedback(null);if(next==='edit'){if(!edit.canManage)return;edit.start();}if(next==='withdraw'&&!edit.canManage)return;setMode(next);};
 const save=async()=>{if(ownerBlocked)return;if(await edit.save()){setMode('overview');setFeedback('Los cambios se guardaron.');}};
 return <AgreementStepModal title={titles[mode]} closeLabel="Cerrar administración de publicación" onClose={()=>{if(!r.busy)onClose();}} closeDisabled={r.busy} fillHeight keyboardAvoiding contentKey={mode} contentStyle={s.content}
  refresh={{onRefresh:()=>{if(mode==='overview'&&!r.busy)r.reloadGallery();},refreshing:r.galleryLoading,enabled:mode==='overview'&&!r.busy&&!r.galleryLoading,label:'esta publicación'}}>
  {mode!=='overview'&&<Pressable accessibilityRole="button" accessibilityLabel="Volver a opciones de publicación" disabled={r.busy} onPress={back} style={s.back}><ArrowLeft size={17} color={c.primary} aria-hidden/><Text style={s.backText}>Opciones de publicación</Text></Pressable>}
  {resource&&<View style={s.summary}><View accessible={false} aria-hidden style={s.resourceIcon}><Package size={22} color={c.secondary}/></View><View style={s.identity}><Text style={s.title}>{resource.title}</Text><Text style={s.helper}>{statusLabel(resource.status)} · {resource.campus.name}</Text><PhysicalgoodsOriginalPrice compact original={resource.originalTerms} current={{modality:resource.modality,amount:resource.price,currency:'CLP'}}/></View></View>}
  {feedback&&<Text accessibilityLiveRegion="polite" style={s.feedback}>{feedback}</Text>}
  {r.galleryError&&<View style={s.errorBox}><Text accessibilityRole="alert" style={s.error}>{r.galleryError}</Text>{mode==='edit'&&<Text style={s.helper}>Recargar descarta los cambios de este formulario.</Text>}<RequestButton label="Recargar publicación" disabled={r.busy||r.galleryLoading} onPress={()=>{if(mode==='edit'){edit.reload();setMode('overview');}else r.reloadGallery();}}/></View>}
  {r.galleryLoading&&mode==='overview'?<ManagementSkeleton/>:!resource&&!r.galleryError?<Text style={s.helper}>No se encontró una publicación disponible para administrar.</Text>:r.gallery&&!r.gallery.canEdit?<Text style={s.helper}>Esta publicación ya no está disponible para administrar desde tu contexto actual.</Text>:<>
   {mode==='overview'&&<View style={s.options}>
    <Text style={s.helper}>Elige qué quieres cambiar en tu publicación.</Text>
    {edit.canManage&&<ManagementAction icon={Pencil} title="Editar datos" description="Nombre, descripción, condición, modalidad y precio." disabled={blocked} onPress={()=>choose('edit')}/>}
    <ManagementAction icon={Images} title="Gestionar fotos" description={`${resource?.images.length??0}/${PHYSICALGOODS_MAX_IMAGES} publicadas · Añadir, quitar o elegir portada.`} disabled={blocked} onPress={()=>choose('photos')}/>
    <ManagementAction icon={Tags} title="Cambiar categoría" description={resource?.category.name??'Selecciona la categoría del recurso.'} disabled={blocked} onPress={()=>choose('category')}/>
    {edit.canManage&&<View style={s.withdrawOption}><ManagementAction icon={Archive} title="Retirar publicación" description="Dejará de aparecer en el Mercado." danger disabled={blocked} onPress={()=>choose('withdraw')}/></View>}
   </View>}
   {mode==='edit'&&(edit.draft?<PhysicalgoodsEditor edit={edit} disabled={ownerBlocked} busy={r.busy} onSave={()=>void save()} onCancel={back}/>:<Text style={s.helper}>Vuelve a las opciones para iniciar una edición con los datos actuales.</Text>)}
   {mode==='photos'&&resource&&<>
    <View style={s.card}><Text style={s.sectionTitle}>Fotos publicadas · {resource.images.length}/{PHYSICALGOODS_MAX_IMAGES}</Text><Text style={s.helper}>La estrella marca la portada. Desliza para ver todas las fotos.</Text>
     <PublicationImages photos={resource.images.map(image=>({uri:image.url}))} principalIndex={resource.images.findIndex(image=>image.principal)} disabled={blocked} removeDisabled={resource.images.length<=1}
      onPrincipal={index=>{if(!blocked)void r.principal(resource.images[index].id);}} onRemove={index=>{if(!blocked&&resource.images.length>1)void r.retire(resource.images[index].id);}}/>
     {resource.images.length===1&&<Text style={s.helper}>Debes conservar al menos una foto publicada.</Text>}
    </View>
    <View style={s.card}><Text style={s.sectionTitle}>Añadir fotos</Text><Text style={s.helper}>JPEG, PNG o WebP · Hasta 5 MB por foto · Máximo {PHYSICALGOODS_MAX_IMAGES} en total.</Text>
     {drafts.length>0&&<><Text style={s.pending}>{drafts.length} foto{drafts.length===1?'':'s'} por guardar</Text><PublicationImages photos={drafts} disabled={blocked} onRemove={index=>{if(!blocked)r.removeDraft(index);}}/>
      <PublicationSubmit label={r.busy?'Guardando fotos…':'Guardar fotos nuevas'} disabled={blocked||resource.images.length+drafts.length>PHYSICALGOODS_MAX_IMAGES} busy={r.busy} onPress={()=>{if(!blocked)void r.upload();}}/></>}
     {r.remainingImageSlots>0?<PublicationUpload label="Seleccionar fotos" hint={`${r.remainingImageSlots} espacio${r.remainingImageSlots===1?'':'s'} disponible${r.remainingImageSlots===1?'':'s'}`} disabled={blocked} onPress={()=>{if(!blocked)void r.selectPhotos();}}/>:<Text style={s.helper}>Alcanzaste el máximo de fotos. Quita una para añadir otra.</Text>}
    </View>
   </>}
   {mode==='category'&&<View style={s.card}><Text style={s.sectionTitle}>Categoría del recurso</Text><Text style={s.helper}>Ayuda a que otros estudiantes encuentren tu publicación.</Text>
    <SearchableFilterSelect label="Categoría" searchable={false} options={orderPhysicalgoodsCategories(r.options?.categories??[])} value={r.editCategory} onChange={r.setEditCategory} expanded={categoryOpen} onExpandedChange={setCategoryOpen} disabled={blocked||!r.options} allowEmpty={false}/>
    {!r.options&&<RequestButton label="Reintentar categorías" disabled={r.loading} onPress={r.reload}/>}
    <PublicationSubmit label={r.busy?'Guardando categoría…':'Guardar categoría'} disabled={blocked||!r.options||!r.editCategory||r.editCategory===r.gallery?.category.id} busy={r.busy} onPress={()=>{if(!blocked)void r.saveCategory();}}/>
   </View>}
   {mode==='withdraw'&&<View style={[s.card,s.dangerCard]}><View accessible={false} aria-hidden style={[s.actionIcon,s.dangerIcon]}><Archive size={24} color="#AD3029"/></View><Text style={s.sectionTitle}>¿Retirar esta publicación?</Text>
    <Text style={s.body}>Dejará de aparecer en búsquedas y no recibirá nuevas solicitudes.</Text><Text style={s.helper}>Conservarás sus fotografías y el historial de solicitudes y transacciones.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Confirmar retirada de publicación" disabled={ownerBlocked} accessibilityState={{disabled:ownerBlocked,busy:r.busy}} onPress={()=>{if(!ownerBlocked)void edit.withdraw();}} style={[s.dangerButton,ownerBlocked&&s.disabled]}>{r.busy&&<ActivityIndicator color={c.surface}/>}<Text style={s.dangerButtonText}>{r.busy?'Retirando…':'Retirar publicación'}</Text></Pressable>
    <RequestButton label="Conservar publicación" disabled={r.busy} onPress={back}/>
   </View>}
  </>}
 </AgreementStepModal>;
}

function ManagementSkeleton(){return <Skeleton label="Cargando administración de publicación" contentStyle={s.options}><SkeletonBlock width="80%" height={18}/>{[0,1,2,3].map(index=><View key={index} style={s.action}><SkeletonBlock width={44} height={44} borderRadius={12}/><View style={s.identity}><SkeletonBlock width="75%" height={20}/><SkeletonBlock width="95%" height={28}/></View></View>)}</Skeleton>;}
