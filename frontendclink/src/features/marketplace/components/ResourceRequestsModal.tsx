import {useEffect,useState,type ReactNode} from 'react';
import {StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {ChevronRight,Package,FileText,Star,UserRound} from 'lucide-react-native';
import {APP_COLORS} from '@/types/colors';
import {Pagination} from '@/components/Pagination';
import {Skeleton,SkeletonBlock} from '@/components/Skeleton';
import {AgreementStepModal} from './AgreementStepModal';
import {CATALOG_COLORS as colors} from './CatalogUI';
import {RequestButton} from './RequestsUI';
import type {RequestTone} from './RequestAccordionCard';

export interface ResourceRequestItem{
  id:string;name:string;careers?:string[];message:string;requestedAt:string;status:string;tone:RequestTone;
  averageRating?:number|null;ratingCount?:number;
  priceDetails?:ReactNode;
  canAccept:boolean;canReject:boolean;onAccept:()=>void;onReject:()=>void;onDetails?:()=>void;onTransaction?:()=>void;
}

export function ResourceRequestsRow({title,summary,summaryContent,count,statusLabel,onPress,disabled=false,digital=false}:{title:string;summary?:string;summaryContent?:ReactNode;count:number;statusLabel:string;onPress:()=>void;disabled?:boolean;digital?:boolean}){
  const Icon=digital?FileText:Package;
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Ver ${count} solicitud${count===1?'':'es'} de ${title}`} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} activeOpacity={0.75} style={styles.resourceRow}>
    <View accessible={false} aria-hidden style={styles.resourceIcon}><Icon size={20} color={colors.primary}/></View>
    <View style={{flex:1,minWidth:0,gap:4}}><Text style={styles.resourceTitle}>{title}</Text>{summaryContent??<Text style={styles.meta}>{summary}</Text>}<Text style={styles.resourceCount}>{count} solicitud{count===1?'':'es'} · {statusLabel}</Text></View>
    <View accessible={false} aria-hidden><ChevronRight size={20} color={colors.secondary}/></View>
  </TouchableOpacity>;
}
export function orderResourceRequests<T extends {id:string;requestedAt:string}>(rows:T[],order:'oldest'|'newest'){
  return [...rows].sort((a,b)=>{const time=(Date.parse(a.requestedAt)||0)-(Date.parse(b.requestedAt)||0);const result=time||a.id.localeCompare(b.id);return order==='oldest'?result:-result;});
}
export function resourceRequestAge(value:string,now=Date.now()){
  const date=new Date(value);if(Number.isNaN(date.getTime()))return 'Sin fecha';
  const minutes=Math.max(0,Math.floor((now-date.getTime())/60000));
  return minutes<1?'Ahora':minutes<60?`hace ${minutes} min`:minutes<1440?`hace ${Math.floor(minutes/60)} h`:minutes<2880?'ayer':minutes<10080?`hace ${Math.floor(minutes/1440)} días`:date.toLocaleDateString('es-CL',{day:'numeric',month:'short'});
}

/** Consulta/decisión genérica: no importa contratos ni hooks de physicalgoods. */
export function ResourceRequestsModal({title,summary,summaryContent,requests,loading,error,feedback,blocked=false,onRefresh,onClose,overlay,notice,pagination,digital=false}:{
  title:string;summary?:string;summaryContent?:ReactNode;requests:ResourceRequestItem[];loading:boolean;error:string|null;feedback?:string|null;blocked?:boolean;
  onRefresh:()=>void;onClose:()=>void;overlay?:ReactNode;notice?:string;digital?:boolean;
  pagination?:{page:number;total:number;order:'oldest'|'newest';onPageChange:(page:number)=>void;onOrderChange:(order:'oldest'|'newest')=>void};
}){
  const [localOrder,setLocalOrder]=useState<'oldest'|'newest'>('oldest'),[localPage,setLocalPage]=useState(1),[selected,setSelected]=useState<string|null>(null);
  const Icon=digital?FileText:Package;
  const order=pagination?.order??localOrder,page=pagination?.page??localPage,total=pagination?.total??requests.length;
  const setOrder=(value:'oldest'|'newest')=>pagination?pagination.onOrderChange(value):setLocalOrder(value);
  const setPage=(value:number)=>pagination?pagination.onPageChange(value):setLocalPage(value);
  const sorted=pagination?requests:orderResourceRequests(requests,order),totalPages=Math.max(1,Math.ceil(total/10)),current=Math.min(page,totalPages);
  const rows=pagination?sorted:sorted.slice((current-1)*10,current*10),active=rows.some(row=>row.id===selected)?selected:null;
  useEffect(()=>{if(page>totalPages)setPage(totalPages);},[page,totalPages]);
  const locked=blocked||loading||Boolean(error)||Boolean(overlay);
  const pager=total>=10?<View style={{minHeight:76}}>{loading?<Skeleton label="Cargando paginación"><SkeletonBlock width="70%" height={48}/></Skeleton>:<View pointerEvents={locked?'none':'auto'} aria-disabled={locked}><Pagination page={current} totalPages={totalPages} showSinglePage label="Páginas de solicitudes del recurso" onPageChange={value=>{if(!locked){setPage(value);setSelected(null);}}}/></View>}</View>:undefined;
  return <AgreementStepModal title="Solicitudes recibidas" closeLabel="Cerrar solicitudes del recurso" onClose={onClose} closeDisabled={blocked} fillHeight
    contentStyle={styles.content} contentKey={`${order}:${current}`} overlay={overlay} footer={pager}
    refresh={{onRefresh,refreshing:loading,enabled:!blocked&&!loading&&!overlay,label:'las solicitudes de este recurso'}}>
    <View style={styles.resource}><View accessible={false} aria-hidden style={styles.resourceIcon}><Icon size={20} color={colors.primary}/></View><View style={{flex:1,minWidth:0,gap:3}}><Text accessibilityRole="header" style={styles.resourceTitle}>{title}</Text>{summaryContent}<Text style={styles.meta}>{summaryContent?null:`${summary} · `}{total} solicitud{total===1?'':'es'}</Text></View></View>
    <View accessibilityRole="tablist" accessibilityLabel="Orden de solicitudes" style={styles.orders}>{[{value:'oldest',label:'Más antiguas'},{value:'newest',label:'Más recientes'}].map(tab=><TouchableOpacity key={tab.value} accessibilityRole="tab" accessibilityState={{selected:order===tab.value,disabled:locked}} aria-selected={order===tab.value} disabled={locked} onPress={()=>{setOrder(tab.value as 'oldest'|'newest');setPage(1);setSelected(null);}} style={[styles.order,order===tab.value&&styles.orderActive]}><Text style={[styles.orderText,order===tab.value&&styles.orderTextActive]}>{tab.label}</Text></TouchableOpacity>)}</View>
    {feedback&&<Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>}
    {notice&&<Text style={styles.meta}>{notice}</Text>}
    {error&&<View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><RequestButton label="Reintentar solicitudes" onPress={onRefresh} disabled={blocked||loading}/></View>}
    {loading?<ResourceRequestsSkeleton showActions={Boolean(active)} count={rows.length||3} activeIndex={rows.findIndex(row=>row.id===active)}/>:!requests.length&&!error?<Text style={styles.empty}>No hay solicitudes para mostrar en este recurso.</Text>:<View style={styles.list}>{rows.map(row=>{
      const expanded=active===row.id;
      const hasRating=typeof row.averageRating==='number'&&Number.isFinite(row.averageRating)&&(row.ratingCount??0)>0;
      const score=hasRating?row.averageRating!.toLocaleString('es-CL',{minimumFractionDigits:1,maximumFractionDigits:1}):'';
      const ratingLabel=hasRating?`${score} · ${row.ratingCount} ${row.ratingCount===1?'valoración':'valoraciones'}`:'Sin valoraciones todavía';
      return <View key={row.id} style={[styles.row,expanded&&styles.rowActive]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Revisar solicitud de ${row.name}`} aria-expanded={expanded} accessibilityState={{expanded,disabled:locked}} disabled={locked} onPress={()=>setSelected(expanded?null:row.id)} activeOpacity={0.8}>
          <View style={styles.person}><View accessible={false} aria-hidden style={styles.avatar}><UserRound size={22} color={colors.primary}/></View><View style={styles.identity}><Text style={styles.name}>{row.name}</Text>{Boolean(row.careers?.length)&&<Text style={styles.career}>{row.careers!.join(' · ')}</Text>}
            {typeof row.ratingCount==='number'&&<View style={styles.rating} accessible accessibilityLabel={hasRating?`Valoración de ${row.name}: ${score} de 5. ${row.ratingCount} ${row.ratingCount===1?'valoración':'valoraciones'}`:'Sin valoraciones todavía'}>
              <Star size={13} color={hasRating?APP_COLORS.ACCENT:colors.secondary} fill={hasRating?APP_COLORS.ACCENT:'transparent'} aria-hidden/>
              <Text style={styles.ratingText}>{ratingLabel}</Text>
            </View>}
          </View><Text accessibilityLabel={new Date(row.requestedAt).toLocaleString('es-CL')} style={styles.date}>{resourceRequestAge(row.requestedAt)}</Text></View>
          <Text numberOfLines={expanded?undefined:2} style={styles.message}>{row.message}</Text>
        </TouchableOpacity>
        {(expanded||row.tone!=='pending')&&<Text style={[styles.status,row.tone==='rejected'&&styles.error]}>{row.status}</Text>}
        {expanded&&<>
          {row.priceDetails}
          {(row.canAccept||row.canReject)&&<View style={styles.actions}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Rechazar solicitud de ${row.name}`} accessibilityState={{disabled:locked||!row.canReject}} disabled={locked||!row.canReject} onPress={row.onReject} activeOpacity={0.75} style={[styles.decisionButton,styles.rejectButton,(locked||!row.canReject)&&styles.decisionDisabled]}><Text style={styles.rejectText}>Rechazar</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Aceptar solicitud de ${row.name}`} accessibilityState={{disabled:locked||!row.canAccept}} disabled={locked||!row.canAccept} onPress={row.onAccept} activeOpacity={0.75} style={[styles.decisionButton,styles.acceptButton,(locked||!row.canAccept)&&styles.decisionDisabled]}><Text style={styles.acceptText}>Aceptar</Text></TouchableOpacity>
          </View>}
          {((row.onDetails&&row.tone!=='pending')||row.onTransaction)&&<View style={styles.links}>
            {row.onDetails&&row.tone!=='pending'&&<RequestButton variant="text" label="Ver solicitud" onPress={row.onDetails} disabled={locked}/>}
            {row.onTransaction&&<RequestButton variant="text" label="Ver transacción" onPress={row.onTransaction} disabled={locked}/>}</View>}
        </>}
      </View>;
    })}</View>}
  </AgreementStepModal>;
}

export function ResourceRequestsSkeleton({showActions=false,count=5,activeIndex=0}:{showActions?:boolean;count?:number;activeIndex?:number}){
  return <Skeleton label="Cargando detalle de solicitudes" contentStyle={{gap:10}}>{Array.from({length:Math.max(1,Math.min(10,count))},(_,index)=><View key={index} style={styles.row}><View style={styles.person}><SkeletonBlock width={40} height={40} borderRadius={20}/><View style={{flex:1,gap:3}}><SkeletonBlock width="65%" height={20}/><SkeletonBlock width="85%" height={16}/><SkeletonBlock width="65%" height={16}/></View><SkeletonBlock width={35} height={10}/></View><SkeletonBlock width="100%" height={40} borderRadius={10}/>{index===activeIndex&&showActions&&<View style={styles.actions}><View style={{flex:1}}><SkeletonBlock width="100%" height={44} borderRadius={12}/></View><View style={{flex:1}}><SkeletonBlock width="100%" height={44} borderRadius={12}/></View></View>}</View>)}</Skeleton>;
}

const styles=StyleSheet.create({
 content:{padding:12,gap:14,backgroundColor:colors.surface},resourceRow:{padding:16,backgroundColor:colors.surface,borderRadius:18,flexDirection:'row',alignItems:'center',gap:12},resourceCount:{color:colors.primary,fontSize:12,lineHeight:17,fontWeight:'600'},resource:{flexDirection:'row',alignItems:'center',gap:10},resourceIcon:{width:36,height:36,borderRadius:10,backgroundColor:colors.tint,alignItems:'center',justifyContent:'center'},resourceTitle:{color:colors.primary,fontSize:16,lineHeight:22,fontWeight:'700'},meta:{color:colors.secondary,fontSize:11,lineHeight:17},
 orders:{flexDirection:'row',gap:8},order:{minHeight:40,paddingHorizontal:14,justifyContent:'center',borderWidth:1,borderColor:colors.inputBorder,borderRadius:20},orderActive:{backgroundColor:colors.primary,borderColor:colors.primary},orderText:{color:colors.primary,fontSize:12,fontWeight:'600'},orderTextActive:{color:colors.surface},
 list:{gap:10},row:{padding:14,gap:10,borderWidth:1,borderColor:colors.border,borderRadius:16,backgroundColor:colors.surface},rowActive:{borderColor:colors.secondary},person:{flexDirection:'row',alignItems:'flex-start',gap:10},avatar:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:colors.tint},rating:{flexDirection:'row',alignItems:'center',gap:4},ratingText:{color:colors.primary,fontSize:11,lineHeight:16,flexShrink:1},identity:{flex:1,minWidth:0,gap:3},name:{color:colors.primary,fontSize:14,lineHeight:20,fontWeight:'700'},career:{color:colors.secondary,fontSize:11,lineHeight:16},date:{color:colors.muted,fontSize:11,lineHeight:17,maxWidth:66,textAlign:'right'},message:{color:colors.ink,fontSize:13,lineHeight:20,marginTop:10,padding:10,borderRadius:10,backgroundColor:colors.background},status:{color:colors.secondary,fontSize:12,lineHeight:18},actions:{flexDirection:'row',alignItems:'stretch',gap:10,borderTopWidth:1,borderColor:colors.border,paddingTop:12},decisionButton:{flex:1,minWidth:0,height:44,alignItems:'center',justifyContent:'center',borderRadius:12,borderWidth:1,paddingHorizontal:8},rejectButton:{backgroundColor:colors.surface,borderColor:colors.inputBorder},acceptButton:{backgroundColor:colors.primary,borderColor:colors.primary},rejectText:{color:colors.primary,fontSize:14,lineHeight:20,fontWeight:'700'},acceptText:{color:colors.surface,fontSize:14,lineHeight:20,fontWeight:'700'},decisionDisabled:{opacity:0.45},links:{flexDirection:'row',flexWrap:'wrap',gap:12},feedback:{color:colors.primary,fontSize:12,lineHeight:18},errorBox:{gap:10,padding:12,borderRadius:12,backgroundColor:colors.background},error:{color:'#9D302A'},empty:{color:colors.secondary,fontSize:14,lineHeight:21,textAlign:'center',padding:20},
});
