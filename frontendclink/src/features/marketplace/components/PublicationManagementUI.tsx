import {Pressable,StyleSheet,Text,View} from 'react-native';
import {ChevronRight,type LucideIcon} from 'lucide-react-native';
import {CATALOG_COLORS as c} from './CatalogUI';

/** Presentación común; cada dominio conserva sus permisos y operaciones. */
export function ManagementAction({icon:Icon,title,description,onPress,disabled,danger=false}:{icon:LucideIcon;title:string;description:string;onPress:()=>void;disabled:boolean;danger?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.action,danger&&s.dangerCard,disabled&&s.disabled]}>
  <View accessible={false} aria-hidden style={[s.actionIcon,danger&&s.dangerIcon]}><Icon size={22} color={danger?'#AD3029':c.primary}/></View><View style={s.identity}><Text style={[s.actionTitle,danger&&s.error]}>{title}</Text><Text style={s.helper}>{description}</Text></View><ChevronRight size={18} color={danger?'#AD3029':c.secondary} aria-hidden/>
 </Pressable>;
}

export const publicationManagementUI=StyleSheet.create({
 content:{padding:14,gap:16,backgroundColor:c.background,flexGrow:1},options:{gap:12},identity:{flex:1,minWidth:0,gap:4},summary:{padding:14,borderRadius:16,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,flexDirection:'row',alignItems:'center',gap:12},resourceIcon:{width:44,height:44,borderRadius:12,backgroundColor:c.tint,alignItems:'center',justifyContent:'center'},title:{fontSize:16,lineHeight:22,fontWeight:'700',color:c.ink},amount:{fontSize:13,lineHeight:19,fontWeight:'700',color:c.primary},helper:{fontSize:12,lineHeight:18,color:c.secondary},body:{fontSize:14,lineHeight:22,color:c.ink},
 action:{padding:14,minHeight:82,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,flexDirection:'row',alignItems:'center',gap:12},actionIcon:{width:44,height:44,borderRadius:12,backgroundColor:c.tint,alignItems:'center',justifyContent:'center'},actionTitle:{fontSize:15,lineHeight:21,fontWeight:'700',color:c.primary},withdrawOption:{paddingTop:8},card:{padding:16,gap:14,borderWidth:1,borderColor:c.border,borderRadius:18,backgroundColor:c.surface},sectionTitle:{fontSize:16,lineHeight:22,fontWeight:'700',color:c.ink},
 back:{minHeight:44,alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:8},backText:{fontSize:13,lineHeight:19,fontWeight:'600',color:c.primary},dangerCard:{backgroundColor:'#FFF7F7',borderColor:'#F4CDCD'},dangerIcon:{backgroundColor:'#FBE3E2'},dangerButton:{minHeight:50,padding:12,borderRadius:14,backgroundColor:'#AD3029',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},dangerButtonText:{fontSize:15,lineHeight:21,fontWeight:'700',color:c.surface},disabled:{opacity:0.45},error:{color:'#AD3029',fontSize:13,lineHeight:20},errorBox:{gap:10,padding:14,borderRadius:14,backgroundColor:'#FFF1EE'},feedback:{fontSize:13,lineHeight:19,color:'#17613F'},pending:{fontSize:13,lineHeight:19,color:c.primary,fontWeight:'600'},
});
const s=publicationManagementUI;
