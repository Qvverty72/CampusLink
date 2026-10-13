import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { authStyles as styles } from '@/features/auth/form.styles';
import { canManageAccess } from '@/features/users/access';
import { useReportReview } from '../hooks/useReportReview';
import { isReviewObject, reviewStatusLabels, reviewTypeLabels } from '../types/review';
import type { ReviewDetail, ReviewStatus, ReviewTargetType } from '../types/review';

const labels: Record<string, string> = {
  id:'Identificador', campusId:'Campus', ownerId:'Propietario', recipientId:'Receptor', resourceType:'Tipo de recurso',
  title:'Título', description:'Descripción', modality:'Modalidad', price:'Precio', amount:'Monto acordado', currency:'Moneda',
  status:'Estado', publishedAt:'Publicado el', updatedAt:'Actualizado el', deletedAt:'Retirado el', categoryId:'Categoría',
  condition:'Estado de uso', requestId:'Solicitud', publicationId:'Publicación', requestStatus:'Estado de solicitud',
  startedAt:'Inicio de transacción', completedAt:'Completada el', cancelledAt:'Cancelada el', cancelledById:'Cancelada por',
  cancellationReason:'Motivo de cancelación', cancellationDetail:'Detalle de cancelación', publication:'Publicación asociada',
  confirmations:'Confirmaciones actuales', userId:'Usuario', role:'Participante', confirmedAt:'Confirmado el',
  createdByUserId:'Organizador', type:'Tipo', visibility:'Visibilidad', startAt:'Inicio', endAt:'Fin', createdAt:'Creada el',
  revision:'Versión', category:'Categoría', location:'Ubicación', buildingKey:'Edificio', buildingName:'Nombre de edificio',
  floorKey:'Piso', floorName:'Nombre de piso', poiKey:'Punto de interés', poiName:'Nombre del punto', customLabel:'Ubicación indicada',
  coordinates:'Coordenadas', series:'Serie', index:'Ocurrencia', total:'Total', tags:'Etiquetas',
};
const values: Record<string, string> = {
  FISICO:'Físico', DIGITAL:'Digital', DISPONIBLE:'Disponible', RESERVADO:'Reservado', FINALIZADO:'Finalizado',
  OCULTO:'Oculto', CANCELADO:'Cancelado', DONACION:'Donación', VENTA:'Venta', ACTIVE:'Activa', CANCELLED:'Cancelada',
  PUBLIC:'Pública', HIDDEN:'Oculta', COMMUNITY_ACTIVITY:'Actividad comunitaria', OFFICIAL_EVENT:'Evento oficial',
  RESERVADA:'Reservada', COMPLETADA:'Completada', CANCELADA:'Cancelada', PENDIENTE_CONFIRMACION:'Pendiente de confirmación',
  PROPIETARIO:'Propietario', RECEPTOR:'Receptor', PENDIENTE:'Pendiente', ACEPTADA:'Aceptada', RECHAZADA:'Rechazada',
  NUEVO:'Nuevo', BUEN_ESTADO:'Buen estado', USADO:'Usado', DETERIORADO:'Deteriorado',
};
function date(value: string) { return new Date(value).toLocaleString(); }
function EvidenceValue({ value, field = '' }: { value: unknown; field?: string }) {
  if (Array.isArray(value)) return value.length ? <View style={local.fields}>{value.map((item,index) =>
    <EvidenceValue key={index} value={item} />)}</View> : <Text style={styles.description}>Sin registros.</Text>;
  if (isReviewObject(value)) return <View style={local.fields}>{Object.entries(value).map(([key,item]) =>
    <View key={key} style={local.field}><Text style={styles.label}>{labels[key] ?? key}</Text><EvidenceValue value={item} field={key} /></View>)}</View>;
  const text = value === null ? 'Sin valor registrado' : typeof value === 'string' && /At$/.test(field) && Number.isFinite(Date.parse(value))
    ? date(value) : values[String(value)] ?? String(value);
  return <Text selectable style={styles.description}>{text}</Text>;
}
function Evidence({ title, value, empty }: { title: string; value: Record<string,unknown> | null; empty: string }) {
  return <View style={local.card}><Text style={local.sectionTitle}>{title}</Text>
    {value ? <EvidenceValue value={value} /> : <Text style={styles.description}>{empty}</Text>}
  </View>;
}
function Detail({ entry, campusName, onClose }: { entry: ReviewDetail; campusName: string; onClose: () => void }) {
  const digital = entry.targetType === 'PUBLICACION_DIGITAL' || (entry.targetType === 'TRANSACCION'
    && [entry.snapshot,entry.current].some(context => isReviewObject(context?.publication) && context.publication.resourceType === 'DIGITAL'));
  return <View style={local.detail}>
    <Pressable accessibilityRole="button" onPress={onClose}><Text style={styles.link}>Volver al listado</Text></Pressable>
    <Text style={styles.title}>Detalle de denuncia</Text>
    <Text style={styles.label}>{entry.title ?? reviewTypeLabels[entry.targetType]}</Text>
    <Text style={styles.description}>{reviewTypeLabels[entry.targetType]} · {reviewStatusLabels[entry.status]}</Text>
    <Text style={styles.description}>Campus: {campusName} · {date(entry.reportedAt)}</Text>
    <Text selectable style={styles.description}>Denuncia: {entry.id}</Text>
    <Text selectable style={styles.description}>Elemento: {entry.targetId}</Text>
    <View style={local.card}>
      <Text style={styles.label}>Motivo original</Text><Text selectable style={styles.description}>{entry.reason}</Text>
      <Text style={styles.label}>Descripción de lo ocurrido</Text><Text selectable style={styles.description}>{entry.description ?? 'Sin descripción adicional.'}</Text>
      <Text style={styles.label}>Denunciante</Text><Text selectable style={styles.description}>{entry.reporter.name ?? 'Nombre no disponible'} · {entry.reporter.id}</Text>
    </View>
    <Text style={styles.description}>La evidencia original corresponde al momento de la denuncia. Los antecedentes actuales pueden haber cambiado.</Text>
    <Evidence title="Contenido al denunciar" value={entry.snapshot} empty="Esta denuncia anterior no conserva una instantánea del contenido. No es posible reconstruirla con los datos actuales." />
    <Evidence title="Antecedentes actuales" value={entry.current} empty="No hay información actual disponible para este elemento. La evidencia original se conserva cuando fue registrada." />
    {!!entry.participants.length && <View style={local.card}>
      <Text style={local.sectionTitle}>Participantes de la transacción</Text>
      {entry.participants.map(person => <Text selectable key={person.id} style={styles.description}>{person.name ?? 'Nombre no disponible'} · {person.id}</Text>)}
    </View>}
    {!!entry.activityChanges.length && <View style={local.detail}><Text style={local.sectionTitle}>Cambios registrados de la actividad</Text>
      {entry.activityChanges.map((change,index) => <View key={index} style={local.card}>
        <Text style={styles.label}>Versión {String(change.revision)} · {date(String(change.changedAt))}</Text>
        <Text selectable style={styles.description}>Responsable: {String(change.actorUserId)}</Text>
        <Evidence title="Antes del cambio" value={isReviewObject(change.before) ? change.before : null} empty="Sin antecedentes anteriores." />
        <Evidence title="Después del cambio" value={isReviewObject(change.after) ? change.after : null} empty="Sin antecedentes posteriores." />
      </View>)}
    </View>}
    {digital && <Text style={styles.description}>La consulta de archivos protegidos todavía no está disponible.</Text>}
  </View>;
}
function ReviewContent() {
  const review = useReportReview();
  return <ScrollView style={styles.page} contentContainerStyle={[styles.container,local.container]}>
    <Link href="/profile" style={styles.link}>Volver a mi perfil</Link>
    <Text style={styles.brand}>CAMPUSLINK</Text><Text style={styles.title}>Revisar denuncias</Text>
    <Text style={styles.description}>Contenido reportado en los campus que administras. La identidad del denunciante y la evidencia son información administrativa.</Text>
    <Text style={styles.label}>Campus</Text>
    <View style={local.choices}>{review.campuses.map(campus => <Pressable key={campus.id} accessibilityRole="button"
      accessibilityState={{selected:campus.id===review.campusId}} onPress={() => review.changeCampus(campus.id)}
      style={[local.choice,campus.id===review.campusId && local.active]}><Text style={styles.description}>{campus.name}</Text></Pressable>)}</View>
    {!review.selected && !!review.campusId && <>
      <Text style={styles.label}>Estado de denuncia</Text><View style={local.choices}>
        <Choice label="Todos" selected={!review.filters.status} onPress={() => review.changeFilters({targetType:review.filters.targetType})} />
        {(Object.entries(reviewStatusLabels) as [ReviewStatus,string][]).map(([value,label]) => <Choice key={value} label={label} selected={review.filters.status===value}
          onPress={() => review.changeFilters({...review.filters,status:value})} />)}
      </View>
      <Text style={styles.label}>Tipo de contenido</Text><View style={local.choices}>
        <Choice label="Todos" selected={!review.filters.targetType} onPress={() => review.changeFilters({status:review.filters.status})} />
        {(Object.entries(reviewTypeLabels) as [ReviewTargetType,string][]).map(([value,label]) => <Choice key={value} label={label} selected={review.filters.targetType===value}
          onPress={() => review.changeFilters({...review.filters,targetType:value})} />)}
      </View>
    </>}
    {review.loading && <ActivityIndicator color="#74C69D" accessibilityLabel="Consultando denuncias" />}
    {!!review.error && <Text accessibilityRole="alert" style={styles.error}>{review.error}</Text>}
    {!review.loading && <Pressable accessibilityRole="button" onPress={review.reload}><Text style={styles.link}>{review.error ? 'Reintentar' : 'Actualizar denuncias'}</Text></Pressable>}
    {!review.loading && !review.error && !review.campuses.length && <Text style={styles.description}>No tienes campus activos para revisar denuncias.</Text>}
    {!review.loading && !review.error && !!review.campusId && !review.entries.length && !review.selected && <Text style={styles.description}>No hay denuncias para estos filtros.</Text>}
    {!review.selected && review.entries.map(entry => <Pressable key={entry.id} accessibilityRole="button" disabled={review.loading}
      onPress={() => void review.select(entry.id)} style={local.card}>
      <Text style={local.sectionTitle}>{entry.title ?? reviewTypeLabels[entry.targetType]}</Text>
      <Text style={styles.description}>{reviewTypeLabels[entry.targetType]} · {reviewStatusLabels[entry.status]}</Text>
      <Text style={styles.description}>{date(entry.reportedAt)}</Text>
      <Text selectable style={styles.description}>Elemento: {entry.targetId}</Text>
      <Text style={styles.description}>Motivo: {entry.reason}</Text><Text style={styles.link}>Revisar detalle</Text>
    </Pressable>)}
    {!review.selected && !!review.campusId && <View style={local.choices}>
      <Pressable accessibilityRole="button" disabled={review.loading || review.page===1} style={(review.loading || review.page===1) && styles.disabled}
        onPress={() => review.changePage(review.page-1)}><Text style={styles.link}>Anterior</Text></Pressable>
      <Text style={styles.description}>Página {review.page}</Text>
      <Pressable accessibilityRole="button" disabled={review.loading || !review.hasMore} style={(review.loading || !review.hasMore) && styles.disabled}
        onPress={() => review.changePage(review.page+1)}><Text style={styles.link}>Siguiente</Text></Pressable>
    </View>}
    {review.selected && <Detail entry={review.selected} campusName={review.campuses.find(campus=>campus.id===review.campusId)?.name ?? review.campusId} onClose={review.close} />}
  </ScrollView>;
}
function Choice({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}) {
  return <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress} style={[local.choice,selected && local.active]}>
    <Text style={styles.description}>{label}</Text></Pressable>;
}
export function ReportReviewScreen() {
  const auth = useAuth();
  if (auth.status !== 'ready' || !auth.identity || !canManageAccess(auth.identity.roles)) {
    return <View style={[styles.page,styles.container]}><Text style={styles.description}>Se requiere acceso administrativo vigente para revisar denuncias.</Text></View>;
  }
  const key = JSON.stringify([auth.identity.userId,auth.identity.campusId,auth.identity.roles,auth.session?.access_token]);
  return <ReviewContent key={key} />;
}
const local = StyleSheet.create({
  container:{maxWidth:760,paddingBottom:48}, choices:{flexDirection:'row',flexWrap:'wrap',gap:10,alignItems:'center'},
  choice:{minHeight:44,paddingHorizontal:12,paddingVertical:8,borderWidth:1,borderColor:'#486476',borderRadius:12,justifyContent:'center'},
  active:{borderColor:'#74C69D',backgroundColor:'#173C42'}, card:{padding:16,borderRadius:14,backgroundColor:'#102A3F',gap:6},
  sectionTitle:{color:'#FFFFFF',fontSize:18,fontWeight:'700'}, detail:{gap:14}, fields:{gap:8,paddingLeft:8}, field:{gap:2},
});
