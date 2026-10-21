import { ActivityIndicator,Pressable,Text,View } from 'react-native';
import { APP_COLORS } from '@/types/colors';
import { useOwnedDigitalResources } from '../hooks/useOwnedDigitalResources';
import { DigitalPublicationEditor } from './DigitalPublicationEditor';
export function OwnedDigitalResources(){const state=useOwnedDigitalResources();return <View style={{gap:12,padding:16,borderRadius:16,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#E0E8ED'}}>
  {state.selected?<DigitalPublicationEditor key={state.selected.id} resource={state.selected} onSaved={state.saved} onClose={state.close}/>:<>
    <Pressable accessibilityRole="button" onPress={state.toggle} style={{minHeight:44,justifyContent:'center'}}><Text style={{fontSize:17,fontWeight:'600',color:'#09243A'}}>{state.open?'Cerrar mis publicaciones digitales':'Mis publicaciones digitales'}</Text></Pressable>
    {state.open&&<>{state.error&&<Text style={{color:'#9D302A'}}>{state.error}</Text>}{state.loading?<ActivityIndicator/>:state.items.length?state.items.map(row=><Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`Editar mi recurso ${row.title}`} onPress={()=>state.edit(row.id)} style={{minHeight:54,padding:12,borderWidth:1,borderColor:'#BDCBD5',borderRadius:12,gap:6}}><Text style={{fontSize:16,color:'#09243A'}}>{row.title}</Text><Text style={{color:'#607485'}}>{row.isWithdrawn?'Retirada':row.status} · {row.files.length} archivos conservados</Text></Pressable>):<Text>No hay publicaciones propias en esta página.</Text>}
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:16,alignItems:'center'}}><Pressable accessibilityRole="button" disabled={state.loading||state.page===1} onPress={state.previous} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:APP_COLORS.PRIMARY}}>Publicaciones anteriores</Text></Pressable><Text>{state.page}</Text><Pressable accessibilityRole="button" disabled={state.loading||!state.hasMore} onPress={state.next} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:APP_COLORS.PRIMARY}}>Más publicaciones propias</Text></Pressable><Pressable accessibilityRole="button" onPress={state.reload} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:APP_COLORS.PRIMARY}}>Actualizar mis publicaciones</Text></Pressable></View>
    </>}
  </>}
</View>;}
