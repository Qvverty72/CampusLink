import { ActivityIndicator,Pressable,StyleSheet,Text,View } from 'react-native';
import { APP_COLORS } from '@/types/colors';
import { useAcquiredDigitalResources } from '../hooks/useAcquiredDigitalResources';
export function AcquiredDigitalResources(){const state=useAcquiredDigitalResources();return <View style={styles.box}>
  <Pressable accessibilityRole="button" onPress={state.toggle} style={styles.button}><Text style={styles.heading}>{state.open?'Cerrar materiales adquiridos':'Mis materiales adquiridos'}</Text></Pressable>
  {state.open&&<>
    {state.error&&<Text style={styles.error} accessibilityLiveRegion="polite">{state.error}</Text>}
    {state.loading?<ActivityIndicator/>:state.detail?<>
      <Text style={styles.heading}>{state.detail.title}</Text><Text style={styles.text}>{state.detail.description}</Text>
      <Text style={styles.text}>Condiciones de tu adquisición: {state.detail.acquisition?.modality==='DONACION'?'Donación':`${state.detail.acquisition?.amount?.toLocaleString('es-CL')} ${state.detail.acquisition?.currency}`}</Text>
      <Text style={styles.text}>Adquirido el {state.detail.acquisition&&new Date(state.detail.acquisition.acquiredAt).toLocaleDateString('es-CL')}. Campus de origen: {state.detail.campusName}.</Text>
      {(state.detail.isWithdrawn||state.detail.status!=='DISPONIBLE')&&<Text style={styles.text}>La publicación ya no está disponible en búsquedas. Tu adquisición conserva el acceso.</Text>}
      <Text style={styles.text}>{[...state.detail.careers,...state.detail.subjects].map(row=>row.name).join(' · ')}</Text>
      {state.detail.files.map(file=><Pressable key={file.id} accessibilityRole="button" accessibilityLabel={`Descargar material adquirido ${file.name}`} disabled={Boolean(state.downloading)} onPress={()=>state.save(file)} style={styles.button}>{state.downloading===file.id?<ActivityIndicator/>:<Text style={styles.link}>Descargar {file.name}</Text>}</Pressable>)}
      <Pressable accessibilityRole="button" onPress={state.back} style={styles.button}><Text style={styles.link}>Volver a materiales adquiridos</Text></Pressable>
    </>:state.items.length?state.items.map(row=><Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`Consultar material adquirido ${row.title}`} onPress={()=>state.show(row.id)} style={styles.item}><Text style={styles.heading}>{row.title}</Text><Text style={styles.text}>{row.files.length} archivos · Adquisición completada</Text></Pressable>):<Text style={styles.text}>Aún no tienes materiales adquiridos en esta página.</Text>}
    <Pressable accessibilityRole="button" onPress={state.reload} style={styles.button}><Text style={styles.link}>Actualizar materiales adquiridos</Text></Pressable>
    {!state.detail&&<View style={styles.row}><Pressable accessibilityRole="button" disabled={state.loading||state.page===1} onPress={state.previous} style={styles.button}><Text style={styles.link}>Materiales anteriores</Text></Pressable><Text>{state.page}</Text><Pressable accessibilityRole="button" disabled={state.loading||!state.hasMore} onPress={state.next} style={styles.button}><Text style={styles.link}>Más materiales adquiridos</Text></Pressable></View>}
  </>}
</View>;}
const styles=StyleSheet.create({box:{padding:16,gap:12,borderWidth:1,borderColor:'#E0E8ED',borderRadius:16,backgroundColor:'#FFFFFF'},button:{minHeight:44,justifyContent:'center',paddingVertical:8},heading:{fontSize:17,fontWeight:'600',color:'#09243A'},text:{fontSize:15,lineHeight:23,color:'#40596C'},link:{fontSize:15,color:APP_COLORS.PRIMARY},error:{fontSize:15,color:'#9D302A'},item:{gap:8,padding:12,borderWidth:1,borderColor:'#BDCBD5',borderRadius:12},row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:12}});
