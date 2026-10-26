import {StyleSheet,Text,View} from 'react-native';
import {BadgeCheck,CalendarDays,Check,Flag,MessageSquare} from 'lucide-react-native';
import type {ContentReportReceipt} from '../types/contentReport';
import {APP_COLORS} from '@/types/colors';

const statuses={PENDIENTE:{label:'Pendiente de revisión',color:'#92400E',backgroundColor:'#FFFAEB'},EN_REVISION:{label:'En revisión',color:'#1D4ED8',backgroundColor:'#EFF6FF'},RESUELTO:{label:'Resuelta',color:'#166534',backgroundColor:'#ECFDF3'},DESESTIMADO:{label:'Desestimada',color:'#475569',backgroundColor:'#F1F5F9'}};

/** Acuse privado persistido, con la misma anatomía de la confirmación de actividades. */
export function ContentReportConfirmation({title,transaction=false,receipt,reason,description}:{title:string;transaction?:boolean;receipt:ContentReportReceipt;reason:string;description?:string|null}){
 const date=new Date(receipt.reportedAt),timestamp=`${date.toLocaleDateString('es-CL',{day:'numeric',month:'short',year:'numeric'})} · ${date.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',hour12:false})}`;
 const status=statuses[receipt.status],comment=description?.trim();
 return <View style={s.content}>
  <View style={s.header}><View style={s.success} accessible={false} aria-hidden><Check size={22} color="#15803D"/></View><View style={s.identity}><Text accessibilityRole="header" accessibilityLiveRegion="polite" style={s.title}>Denuncia enviada</Text><Text style={s.body}>{transaction?'Transacción':'Recurso'}: {title}</Text></View></View>
  <View style={s.metadata}>
   <View style={s.row}><View style={s.label}><CalendarDays size={17} color="#64748B" aria-hidden/><Text style={s.body}>Fecha y hora de la denuncia:</Text></View><Text style={s.date}>{timestamp}</Text></View>
   <View style={[s.row,s.divider]}><View style={s.label}><Flag size={17} color="#64748B" aria-hidden/><Text style={s.body}>Motivo</Text></View><View style={[s.badge,{backgroundColor:'#FEF2F2'}]}><Text style={[s.badgeText,{color:'#B42318'}]}>{reason}</Text></View></View>
   <View style={[s.row,s.divider]}><View style={s.label}><BadgeCheck size={17} color="#64748B" aria-hidden/><Text style={s.body}>Estado</Text></View><View style={[s.badge,{backgroundColor:status.backgroundColor}]}><Text style={[s.badgeText,{color:status.color}]}>{status.label}</Text></View></View>
  </View>
  <View style={s.commentsHeader}><View style={s.label}><MessageSquare size={18} color={APP_COLORS.PRIMARY} aria-hidden/><Text accessibilityRole="header" style={s.sectionTitle}>Comentarios</Text></View><Text style={s.muted}>{comment?'1 comentario':'0 comentarios'}</Text></View>
  {comment?<View style={s.commentRow}><View style={s.avatar} accessible={false} aria-hidden><Text style={s.author}>TÚ</Text></View><View style={s.comment}><Text style={s.author}>Tú <Text style={s.muted}>· {timestamp}</Text></Text><Text style={s.body}>{comment}</Text></View></View>:<Text style={s.muted}>No agregaste una descripción a esta denuncia.</Text>}
  <Text style={s.notice}>El caso queda registrado para la administración del campus de origen. Enviar la denuncia no oculta el recurso ni modifica el acuerdo.</Text>
 </View>;
}
const s=StyleSheet.create({
 content:{gap:20},header:{flexDirection:'row',alignItems:'center',gap:12},success:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'#ECFDF3'},identity:{flex:1,minWidth:0,gap:4},title:{fontSize:20,lineHeight:27,fontWeight:'700',color:'#0F172A'},body:{fontSize:13,lineHeight:20,color:'#475569',flexShrink:1},
 metadata:{borderWidth:1,borderColor:'#E2E8F0',borderRadius:14,overflow:'hidden'},row:{padding:12,minHeight:52,flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:10},label:{flexDirection:'row',alignItems:'center',gap:8,flexShrink:1},divider:{borderTopWidth:1,borderColor:'#E2E8F0'},date:{fontSize:12,lineHeight:18,fontWeight:'600',color:'#0F172A',marginLeft:'auto'},badge:{borderRadius:16,paddingHorizontal:10,paddingVertical:5,maxWidth:'100%'},badgeText:{fontSize:12,lineHeight:18,fontWeight:'600'},
 commentsHeader:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:8},sectionTitle:{fontSize:15,lineHeight:22,fontWeight:'700',color:'#0F172A'},commentRow:{flexDirection:'row',gap:10},avatar:{width:32,height:32,borderRadius:16,backgroundColor:'#E8F0F8',alignItems:'center',justifyContent:'center'},comment:{flex:1,minWidth:0,padding:12,borderRadius:12,backgroundColor:'#F8FAFC',gap:6},author:{fontSize:12,lineHeight:18,fontWeight:'700',color:APP_COLORS.PRIMARY},muted:{fontSize:12,lineHeight:18,fontWeight:'400',color:'#64748B'},notice:{fontSize:12,lineHeight:19,color:'#64748B'},
});
