import type {ReactNode} from 'react';
import {StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {CheckCircle2,ChevronDown,ChevronUp,CircleX,Clock3} from 'lucide-react-native';
import {Skeleton,SkeletonBlock} from '@/components/Skeleton';
import {CATALOG_COLORS as colors} from './CatalogUI';

export type RequestTone='pending'|'accepted'|'completed'|'rejected'|'closed';

export function RequestAccordionCard({title,initialName,subtitle,trailing,expanded,disabled=false,onToggle,children,tone='accepted',label=`solicitud: ${title}`,trailingContent}:{
  title:string;initialName:string;subtitle:string;trailing:string;expanded:boolean;disabled?:boolean;onToggle:()=>void;children?:ReactNode;tone?:RequestTone;label?:string;trailingContent?:ReactNode;
}){
  const Chevron=expanded?ChevronUp:ChevronDown;
  return <View style={requestAccordionUI.card}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${expanded?'Contraer':'Abrir'} ${label}`} aria-expanded={expanded} accessibilityState={{expanded,disabled}} disabled={disabled} activeOpacity={0.75} onPress={onToggle} style={requestAccordionUI.header}>
      <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[requestAccordionUI.avatar,{backgroundColor:tone==='pending'?colors.secondary:tone==='closed'||tone==='rejected'?colors.muted:colors.primary}]}><Text style={requestAccordionUI.initial}>{initialName.trim().charAt(0).toLocaleUpperCase('es-CL')||'?'}</Text></View>
      <View style={requestAccordionUI.heading}><Text numberOfLines={expanded?undefined:1} style={requestAccordionUI.title}>{title}</Text><Text numberOfLines={expanded?undefined:1} style={requestAccordionUI.subtitle}>{subtitle}</Text></View>
      <View style={requestAccordionUI.trailing}>{trailingContent??<Text style={expanded?requestAccordionUI.date:requestAccordionUI.compactAmount} numberOfLines={1}>{trailing}</Text>}<View accessible={false} aria-hidden><Chevron size={16} color={colors.secondary}/></View></View>
    </TouchableOpacity>
    {expanded&&<View style={requestAccordionUI.body}>{children}</View>}
  </View>;
}

export function RequestMessage({message,caption,status,tone='pending'}:{message:string;caption:string;status:string;tone?:RequestTone}){
  const StatusIcon=tone==='pending'?Clock3:tone==='rejected'||tone==='closed'?CircleX:CheckCircle2;
  const color=tone==='rejected'?'#9D302A':tone==='closed'?colors.muted:colors.primary;
  return <View style={requestAccordionUI.messagePanel}>
    <View style={requestAccordionUI.bubble}><Text style={requestAccordionUI.message}>{message}</Text></View>
    <Text style={requestAccordionUI.sender}>{caption}</Text>
    <View style={requestAccordionUI.status}><View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><StatusIcon size={17} color={color}/></View><Text style={[requestAccordionUI.statusText,{color}]}>{status}</Text></View>
  </View>;
}

export function RequestAccordionSkeleton({expanded=false,label='Cargando solicitudes'}:{expanded?:boolean;label?:string}){
  return <Skeleton label={label} contentStyle={{gap:14}}>{[0,1,2].map(index=><View key={index} style={requestAccordionUI.card}>
    <View style={requestAccordionUI.header}><SkeletonBlock width={40} height={40} borderRadius={20}/><View style={{flex:1,gap:6}}><SkeletonBlock width="65%" height={16}/><SkeletonBlock width="85%" height={12}/></View><SkeletonBlock width={48} height={14}/></View>
    {index===0&&expanded&&<View style={requestAccordionUI.body}><View style={requestAccordionUI.amountRow}><SkeletonBlock width="35%" height={12}/><SkeletonBlock width="30%" height={27}/></View>
      <View style={requestAccordionUI.messagePanel}><SkeletonBlock height={66} borderRadius={14}/><SkeletonBlock width="65%" height={16}/><View style={requestAccordionUI.status}><SkeletonBlock width={17} height={17} borderRadius={9}/><SkeletonBlock width="70%" height={14}/></View></View>
      <SkeletonBlock height={52} borderRadius={14}/></View>}
  </View>)}</Skeleton>;
}

export const requestAccordionUI=StyleSheet.create({
  card:{backgroundColor:colors.surface,borderRadius:20,overflow:'hidden'},header:{flexDirection:'row',alignItems:'center',gap:12,padding:16,minHeight:76},
  avatar:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center'},initial:{color:colors.surface,fontSize:15,fontWeight:'700'},
  heading:{flex:1,minWidth:0,gap:3},title:{color:colors.primary,fontSize:15,lineHeight:21,fontWeight:'700'},subtitle:{color:colors.secondary,fontSize:12,lineHeight:17},
  trailing:{maxWidth:'35%',alignItems:'flex-end',gap:6},date:{color:colors.muted,fontSize:11,lineHeight:16},compactAmount:{color:colors.primary,fontSize:14,lineHeight:20,fontWeight:'700'},
  body:{paddingHorizontal:16,paddingBottom:16,gap:14},amountRow:{borderTopWidth:1,borderColor:colors.border,paddingTop:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  amountLabel:{color:colors.secondary,fontSize:12,lineHeight:18,flexShrink:1},amount:{color:colors.primary,fontSize:20,lineHeight:27,fontWeight:'800',flexShrink:1,textAlign:'right'},
  messagePanel:{padding:12,borderRadius:16,backgroundColor:colors.background,gap:8},
  bubble:{alignSelf:'flex-end',maxWidth:'100%',marginLeft:12,padding:12,borderRadius:16,borderBottomRightRadius:4,backgroundColor:colors.primary},message:{color:colors.surface,fontSize:14,lineHeight:21},
  sender:{color:colors.secondary,fontSize:11,lineHeight:16,textAlign:'right'},status:{minHeight:40,flexDirection:'row',alignItems:'center',gap:8,paddingTop:4},statusText:{flex:1,fontSize:12,lineHeight:18},
});
