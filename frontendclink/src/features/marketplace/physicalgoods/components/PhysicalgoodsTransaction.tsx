import {ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {usePhysicalgoodsTransaction} from '../hooks/usePhysicalgoodsTransaction';
import type {PhysicalgoodsTransactionTarget} from '../types/publication';

/** Consulta del acuerdo, decisiones explícitas y mensajes de ubicación sin texto libre. */
export function PhysicalgoodsTransaction({target,onClose,onChanged}:{target:PhysicalgoodsTransactionTarget;onClose:()=>void;onChanged:()=>void}) {
  const t=usePhysicalgoodsTransaction(target,onChanged),detail=t.detail;
  const button=(label:string,press:()=>void,disabled=false)=><Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={press}
    style={[styles.button,disabled&&styles.disabled]}><Text style={styles.action}>{label}</Text></Pressable>;
  const date=(value:string)=>new Date(value).toLocaleString('es-CL');
  const name=(id:string)=>id===detail?.owner.id?detail.owner.fullName:detail?.receiver.fullName;
  const cancellationMessage=detail?.publication.isWithdrawn?'Se cancelará el acuerdo y se conservará su historial. La publicación seguirá retirada.'
    :['OCULTO','CANCELADO'].includes(detail?.publication.status??'')?'Se cancelará el acuerdo y se conservará su historial. La publicación seguirá fuera del marketplace.'
      :'El recurso volverá a estar disponible. Las otras solicitudes pendientes podrán resolverse y se conservará este acuerdo cancelado.';
  const close=()=>{if(!t.busy)onClose();};
  return <Modal visible onRequestClose={close} animationType="slide"><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    {button('Cerrar acuerdo',close,t.busy)}
    <Text accessibilityRole="header" style={styles.title}>Acuerdo del recurso</Text>
    {button('Actualizar acuerdo',t.reload,t.busy||t.loading)}
    {(t.loading||t.busy)&&<ActivityIndicator accessibilityLabel={t.busy?'Guardando acuerdo':'Cargando acuerdo'} />}
    {t.error&&<Text accessibilityRole="alert" style={styles.error}>{t.error}</Text>}
    {detail&&<>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.subtitle}>{detail.publication.title}</Text>
        <Text style={styles.text}>Estado del acuerdo: {detail.status.toLowerCase().replace('_',' ')}</Text>
        <Text style={styles.text}>Estado del recurso: {detail.publication.status.toLowerCase()}</Text>
        {detail.publication.isWithdrawn&&<Text style={styles.text}>La publicación fue retirada. Se conserva este acuerdo.</Text>}
        <Text style={styles.text}>Campus: {detail.campus.name}</Text>
        {t.historical&&<Text style={styles.text}>Consulta histórica de otro campus. Puedes revisar el acuerdo y sus mensajes.</Text>}
        <Text style={styles.text}>Propietario: {detail.owner.fullName}</Text><Text style={styles.text}>Receptor: {detail.receiver.fullName}</Text>
        <Text style={styles.label}>{detail.modality==='DONACION'?'Acuerdo de donación':`Precio acordado: ${detail.amount?.toLocaleString('es-CL')} ${detail.currency}`}</Text>
        <Text style={styles.text}>Iniciado: {date(detail.startedAt)}</Text>
        {detail.completedAt&&<Text style={styles.text}>Completado: {date(detail.completedAt)}</Text>}
        {detail.cancelledAt&&<Text style={styles.text}>Cancelado por {name(detail.cancelledById!)}: {date(detail.cancelledAt)}</Text>}
      </View>
      <View style={styles.card}>
        <Text style={styles.subtitle}>Confirmaciones del intercambio</Text>
        {[detail.owner,detail.receiver].map(participant=>{
          const confirmation=detail.confirmations.find(value=>value.userId===participant.id);
          return <Text key={participant.id} style={styles.text}>{participant.fullName}: {confirmation?`confirmó el ${date(confirmation.confirmedAt)}`:'confirmación pendiente'}</Text>;
        })}
        {detail.canCancel&&<Text style={styles.text}>El intercambio se completa cuando ambas partes confirman.</Text>}
        {detail.canConfirm&&button('Confirmar intercambio',()=>t.selectAction('confirm'),t.busy||t.loading)}
        {detail.canCancel&&button('Cancelar acuerdo',()=>t.selectAction('cancel'),t.busy||t.loading)}
        {t.action&&<View style={styles.card}>
          <Text style={styles.label}>{t.action==='confirm'?'Confirmar que el intercambio se realizó':'Cancelar este acuerdo'}</Text>
          <Text style={styles.text}>{t.action==='confirm'?'Se registrará tu confirmación. El acuerdo finalizará cuando ambas partes hayan confirmado.':cancellationMessage}</Text>
          {button(t.action==='confirm'?'Confirmar mi participación':'Confirmar cancelación',()=>void(t.action==='confirm'?t.confirm():t.cancel()),t.busy||t.loading)}
          {button('Volver al acuerdo',t.cancelAction,t.busy)}
        </View>}
      </View>
      {detail.status==='COMPLETADA'&&<View style={styles.card}>
        <Text style={styles.subtitle}>Valoración del propietario</Text>
        {detail.rating?<>
          <Text style={styles.label}>Puntuación: {detail.rating.score} de 5</Text>
          <Text style={styles.text}>Registrada: {date(detail.rating.createdAt)}</Text>
          <Text style={styles.text}>Esta valoración no se puede editar.</Text>
        </>:detail.canRate?<>
          <Text style={styles.text}>Valora tu intercambio con {detail.owner.fullName}.</Text>
          {!t.ratingConfirmation?<>
            <View style={styles.choices}>{[1,2,3,4,5].map(score=><Pressable key={score} accessibilityRole="radio" accessibilityLabel={`Puntuar con ${score} de 5`}
              accessibilityState={{checked:t.ratingScore===score,disabled:t.busy||t.loading}} disabled={t.busy||t.loading} onPress={()=>t.selectRating(score)}
              style={[styles.button,t.ratingScore===score&&styles.selected]}><Text style={styles.action}>{score}</Text></Pressable>)}</View>
            {button('Valorar al propietario',t.confirmRating,t.busy||t.loading||t.ratingScore===null)}
          </>:<>
            <Text style={styles.label}>Enviar una valoración de {t.ratingScore} de 5</Text>
            <Text style={styles.text}>La valoración quedará vinculada a este intercambio y no podrás editarla después.</Text>
            {button('Confirmar valoración',()=>void t.rate(),t.busy||t.loading)}
            {button('Cancelar valoración',t.cancelRating,t.busy)}
          </>}
        </>:<Text style={styles.text}>Aún no se ha registrado una valoración.</Text>}
      </View>}
      {detail.canCancel&&<View style={styles.card}>
        <Text style={styles.subtitle}>Coordinar el intercambio</Text><Text style={styles.text}>Selecciona dónde estás para avisar a la otra persona.</Text>
        {t.optionsLoading&&<ActivityIndicator accessibilityLabel="Cargando ubicaciones" />}
        {t.optionsError&&<Text accessibilityRole="alert" style={styles.error}>{t.optionsError}</Text>}
        {t.options&&!t.options.buildings.length&&<Text style={styles.text}>No hay edificios y pisos disponibles en el mapa del campus.</Text>}
        <Text style={styles.label}>Edificio</Text>
        <View style={styles.choices}>{t.options?.buildings.map(building=><Pressable key={building.id} accessibilityRole="radio" accessibilityLabel={`Edificio: ${building.name}`}
          accessibilityState={{checked:t.buildingId===building.id,disabled:t.busy}} disabled={t.busy} onPress={()=>t.setBuilding(building.id)} style={[styles.button,t.buildingId===building.id&&styles.selected]}><Text style={styles.action}>{building.name}</Text></Pressable>)}</View>
        <Text style={styles.label}>Piso</Text>
        <View style={styles.choices}>{t.building?.floors.map(floor=><Pressable key={floor.id} accessibilityRole="radio" accessibilityLabel={`Piso: ${floor.name}`}
          accessibilityState={{checked:t.floorId===floor.id,disabled:t.busy}} disabled={t.busy} onPress={()=>t.setFloor(floor.id)} style={[styles.button,t.floorId===floor.id&&styles.selected]}><Text style={styles.action}>{floor.name}</Text></Pressable>)}</View>
        {t.preview&&<Text style={styles.text}>{t.preview}</Text>}
        {button('Enviar mi ubicación',()=>void t.send(),t.busy||!t.preview||t.optionsLoading)}
      </View>}
      <View style={styles.card}>
        <Text style={styles.subtitle}>Mensajes de coordinación</Text>
        {t.messagesLoading&&<ActivityIndicator accessibilityLabel="Cargando mensajes de coordinación" />}
        {t.messageError&&<Text accessibilityRole="alert" style={styles.error}>{t.messageError}</Text>}
        {t.messages&&!t.messages.data.length&&<Text style={styles.text}>Todavía no hay mensajes de coordinación.</Text>}
        {t.messages?.data.map(message=><View key={message.id} style={styles.message}>
          <Text style={styles.label}>{name(message.senderId)}</Text><Text style={styles.text}>{message.text}</Text><Text style={styles.hint}>{date(message.createdAt)}</Text>
        </View>)}
        <View style={styles.choices}>
          {button('Mensajes anteriores',()=>t.setPage(t.page-1),t.busy||t.messagesLoading||t.page===1)}
          <Text style={styles.text}>Página de mensajes {t.page}</Text>
          {button('Mensajes siguientes',()=>t.setPage(t.page+1),t.busy||t.messagesLoading||!t.messages?.meta.hasMore)}
        </View>
      </View>
    </>}
  </ScrollView></Modal>;
}
const styles=StyleSheet.create({
  content:{padding:24,paddingTop:48,paddingBottom:60,gap:16,width:'100%',maxWidth:760,alignSelf:'center'},
  title:{color:'#09243A',fontSize:28,fontWeight:'800'},subtitle:{color:'#09243A',fontSize:20,fontWeight:'700'},label:{color:'#09243A',fontSize:16,fontWeight:'600'},
  text:{color:'#607485',fontSize:15,lineHeight:23},hint:{color:'#607485',fontSize:13},card:{padding:18,borderRadius:16,backgroundColor:'#F4F7F9',gap:12},
  choices:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:10},button:{padding:12,borderRadius:10,borderWidth:1,borderColor:'#0B6E75'},
  action:{color:'#0B6E75',fontSize:15,fontWeight:'600'},selected:{backgroundColor:'#E3F2F0'},disabled:{opacity:0.5},error:{color:'#AD3029',fontSize:15},
  message:{gap:8,paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#C8D7E0'},
});
