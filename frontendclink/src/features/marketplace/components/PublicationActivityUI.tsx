import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {ChevronRight,Package} from 'lucide-react-native';
import {Skeleton,SkeletonBlock} from '@/components/Skeleton';
import {CATALOG_COLORS as colors} from './CatalogUI';

/** Presentación compartida: filtros y filas sin contratos de recursos físicos o digitales. */
export function PublicationActivityFilters<T extends string>({tabs,selected,onSelect}:{tabs:{id:T;label:string}[];selected:T;onSelect:(id:T)=>void}){
 return <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel="Estado de mis publicaciones" contentContainerStyle={styles.filters}>
  {tabs.map(tab=><Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{selected:tab.id===selected}} aria-selected={tab.id===selected} onPress={()=>onSelect(tab.id)} style={[styles.filter,tab.id===selected&&styles.filterSelected]}><Text style={[styles.filterText,tab.id===selected&&styles.filterTextSelected]}>{tab.label}</Text></Pressable>)}
 </ScrollView>;
}

export function PublicationActivityRow({title,amount,subtitle,status,statusTone='active',featured=false,last=false,onPress,onRequests}:{
 title:string;amount:string;subtitle:string;status:string;statusTone?:'active'|'reserved'|'finished'|'withdrawn';featured?:boolean;last?:boolean;onPress:()=>void;onRequests?:()=>void;
}){
 const content=<View style={styles.rowContent}><View accessible={false} aria-hidden style={[styles.icon,statusTone==='withdrawn'&&styles.iconMuted]}><Package size={20} color={statusTone==='withdrawn'?colors.muted:colors.secondary}/></View>
  <View style={styles.identity}><View style={styles.titleRow}><Text numberOfLines={2} style={[styles.title,featured&&styles.featuredTitle]}>{title}</Text><Text style={[styles.amount,featured&&styles.featuredTitle]}>{amount}</Text></View>
   <View style={styles.subtitleRow}>{!featured&&<><View accessible={false} aria-hidden style={[styles.dot,statusTone==='finished'&&styles.dotFinished,statusTone==='reserved'&&styles.dotReserved,statusTone==='withdrawn'&&styles.dotWithdrawn]}/><Text style={styles.subtitle}>{status} · </Text></>}<Text style={[styles.subtitle,styles.subtitleDetails]}>{subtitle}</Text></View>
  </View></View>;
 return <View style={[styles.row,featured?styles.featured:!last&&styles.separator]}>
  <Pressable accessibilityRole="button" accessibilityLabel={`Abrir publicación: ${title}, ${status}`} onPress={onPress} style={styles.open}>{content}</Pressable>
  {featured&&<Pressable accessibilityRole="button" accessibilityLabel={`Revisar solicitudes de ${title}`} onPress={onRequests??onPress} style={styles.pending}><Text style={styles.pendingText}>Publicación con solicitudes pendientes.</Text><ChevronRight size={17} color={colors.primary}/></Pressable>}
 </View>;
}

export function PublicationActivitySkeleton(){
 return <Skeleton label="Cargando mis publicaciones" contentStyle={{gap:16}}><SkeletonBlock width={146} height={13}/><View style={[styles.row,styles.featured,{padding:16,gap:14}]}><View style={styles.rowContent}><SkeletonBlock width={44} height={44} borderRadius={12}/><View style={{flex:1,gap:8}}><SkeletonBlock width="70%" height={15}/><SkeletonBlock width="90%" height={12}/></View><SkeletonBlock width={55} height={15}/></View><SkeletonBlock width="95%" height={18}/></View><SkeletonBlock width={72} height={12}/><View style={publicationActivityUI.history}>{[0,1,2].map(index=><View key={index} style={[styles.rowContent,{padding:16}]}><SkeletonBlock width={40} height={40} borderRadius={12}/><View style={{flex:1,gap:8}}><SkeletonBlock width="65%" height={14}/><SkeletonBlock width="90%" height={12}/></View><SkeletonBlock width={54} height={14}/></View>)}</View></Skeleton>;
}

export const publicationActivityUI=StyleSheet.create({
 section:{gap:16},group:{gap:10},heading:{fontSize:11,lineHeight:16,fontWeight:'700',letterSpacing:0.5,color:colors.muted},actionHeading:{color:colors.primary},history:{backgroundColor:colors.surface,borderRadius:16,overflow:'hidden'},
});
const styles=StyleSheet.create({
 filters:{gap:8,paddingVertical:2},filter:{minHeight:38,paddingHorizontal:15,borderRadius:20,borderWidth:1,borderColor:colors.inputBorder,justifyContent:'center',backgroundColor:colors.surface},filterSelected:{backgroundColor:colors.primary,borderColor:colors.primary},filterText:{fontSize:13,lineHeight:18,color:colors.primary,fontWeight:'500'},filterTextSelected:{color:colors.surface,fontWeight:'700'},
 row:{backgroundColor:colors.surface},featured:{borderRadius:16,borderWidth:1,borderColor:colors.secondary,overflow:'hidden'},separator:{borderBottomWidth:1,borderBottomColor:colors.border},open:{padding:16,minHeight:76},rowContent:{flexDirection:'row',alignItems:'center',gap:12},icon:{width:44,height:44,borderRadius:12,backgroundColor:colors.tint,alignItems:'center',justifyContent:'center'},iconMuted:{opacity:0.75},identity:{flex:1,minWidth:0,gap:4},titleRow:{flexDirection:'row',alignItems:'flex-start',gap:8},title:{flex:1,minWidth:0,fontSize:14,lineHeight:20,fontWeight:'700',color:colors.primary},amount:{flexShrink:0,maxWidth:118,fontSize:14,lineHeight:20,fontWeight:'700',color:colors.primary},featuredTitle:{fontSize:16,lineHeight:22},subtitleRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap'},subtitle:{fontSize:11,lineHeight:17,color:colors.secondary},subtitleDetails:{flexShrink:1},dot:{width:6,height:6,borderRadius:3,backgroundColor:colors.secondary,marginRight:5},dotFinished:{backgroundColor:'#17613F'},dotReserved:{backgroundColor:'#805C0A'},dotWithdrawn:{backgroundColor:colors.muted},pending:{minHeight:44,paddingHorizontal:16,paddingBottom:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},pendingText:{flex:1,fontSize:14,lineHeight:20,color:colors.primary},
});
