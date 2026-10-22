import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { useReportReviews } from '../hooks/useReportReviews';
import { reviewLabels } from '../types/review';

const labels: Record<string, string> = {
  publication: 'Publicación', transaction: 'Transacción', confirmations: 'Confirmaciones',
  titulo: 'Título', title: 'Título', descripcion: 'Descripción', description: 'Descripción',
  tipo_recurso: 'Tipo de recurso', modalidad: 'Modalidad', modality: 'Modalidad', precio: 'Precio',
  moneda: 'Moneda', currency: 'Moneda', estado_publicacion: 'Estado de publicación', status: 'Estado',
  estado_transaccion: 'Estado del acuerdo', monto_acordado: 'Monto acordado', amount: 'Monto',
  modalidad_acordada: 'Modalidad acordada', propietario_id: 'Propietario', receptor_id: 'Receptor',
  propietario_nombre: 'Nombre del propietario', receptor_nombre: 'Nombre del receptor',
  owner: 'Propietario', receiver: 'Receptor', name: 'Nombre', nombre_original: 'Nombre del archivo',
  id: 'Referencia', publicacion_id: 'Publicación', solicitud_id: 'Solicitud', campus_id: 'Campus', campus_nombre: 'Campus',
  iniciada_en: 'Inicio del acuerdo', completada_en: 'Completado', cancelada_en: 'Cancelado',
  startedAt: 'Inicio', completedAt: 'Completado', cancelledAt: 'Cancelado', deletedAt: 'Retirada', deleted_at: 'Retirada',
  createdAt: 'Creación', updatedAt: 'Último cambio', updated_at: 'Último cambio', startAt: 'Inicio', endAt: 'Término',
  type: 'Tipo', visibility: 'Visibilidad', revision: 'Revisión', createdByUserId: 'Organizador',
  location: 'Ubicación', buildingName: 'Edificio', floorName: 'Piso', poiName: 'Punto de interés',
  buildingKey: 'Referencia del edificio', floorKey: 'Referencia del piso', poiKey: 'Referencia del punto',
  category: 'Categoría', tags: 'Etiquetas', series: 'Serie', index: 'Ocurrencia', count: 'Cantidad',
  careers: 'Carreras', subjects: 'Asignaturas', code: 'Código', files: 'Archivos', images: 'Imágenes',
  mimeType: 'Formato', mime_type: 'Formato', sizeBytes: 'Tamaño en bytes', tamano_bytes: 'Tamaño en bytes',
  estado_uso: 'Estado de uso', categoria_id: 'Categoría', orden: 'Orden', rol_confirmante: 'Rol que confirma',
  usuario_id: 'Usuario', userId: 'Usuario', role: 'Rol', confirmado_en: 'Confirmado', confirmedAt: 'Confirmado',
  cancelada_por_id: 'Cancelado por', motivo_cancelacion: 'Motivo de cancelación',
};
const values: Record<string, string> = { ...reviewLabels, FISICO: 'Físico', DIGITAL: 'Digital', VENTA: 'Venta', DONACION: 'Donación',
  DISPONIBLE: 'Disponible', RESERVADO: 'Reservado', FINALIZADO: 'Finalizado', OCULTO: 'Oculto', CANCELADO: 'Cancelado',
  COMPLETADA: 'Completada', CANCELADA: 'Cancelada', RESERVADA: 'Reservada', PENDIENTE_CONFIRMACION: 'Pendiente de confirmación',
  COMMUNITY_ACTIVITY: 'Actividad comunitaria', OFFICIAL_EVENT: 'Evento oficial', PUBLIC: 'Pública', ACTIVE: 'Activa',
  PROPIETARIO: 'Propietario', RECEPTOR: 'Receptor' };
function Evidence({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Text style={styles.text}>Sin antecedentes registrados</Text>;
  if (Array.isArray(value)) return value.length ? <View style={styles.fields}>{value.map((item, index) => <Evidence key={index} value={item} />)}</View> : <Text style={styles.text}>Sin registros</Text>;
  if (typeof value === 'object') return <View style={styles.fields}>{Object.entries(value).filter(([key]) => labels[key]).map(([key, item]) =>
    <View key={key} style={styles.field}><Text style={styles.label}>{labels[key]}</Text><Evidence value={item} /></View>)}</View>;
  return <Text selectable style={styles.text}>{values[String(value)] ?? String(value)}</Text>;
}

/** Revisión y resolución privada del caso con confirmación explícita de la medida. */
export function ReportReviews() {
  const review = useReportReviews();
  const detail = review.detail;
  const publication = detail?.snapshot?.publication;
  const files = !review.history && publication && typeof publication === 'object' && 'files' in publication && Array.isArray(publication.files)
    ? publication.files.filter((file): file is { id: string; name: string } => file && typeof file.id === 'string' && typeof file.name === 'string') : [];
  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>ADMINISTRACIÓN</Text>
      <Text style={styles.title}>{review.history ? 'Historial de resoluciones' : 'Denuncias de contenido'}</Text>
      <Text style={styles.text}>{review.history ? 'Consulta las decisiones registradas en los campus a tu cargo.' : 'Revisa los casos y sus antecedentes en los campus a tu cargo.'}</Text>
      {!review.allowed && <Text style={styles.text}>Se requiere acceso administrativo.</Text>}
      {review.allowed && <View style={styles.choices}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: !review.history }} style={[styles.button, !review.history && styles.active]}
          onPress={() => review.showHistory(false)}><Text style={styles.buttonText}>Revisar denuncias</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: !!review.history }} style={[styles.button, review.history && styles.active]}
          onPress={() => review.showHistory(true)}><Text style={styles.buttonText}>Historial de resoluciones</Text></Pressable>
      </View>}
      <View style={styles.choices}>{review.campuses.map(campus => <Pressable key={campus.id} accessibilityRole="button"
        accessibilityState={{ selected: campus.id === review.campusId }} style={[styles.button, campus.id === review.campusId && styles.active]}
        onPress={() => review.chooseCampus(campus.id)}><Text style={styles.buttonText}>{campus.name}</Text></Pressable>)}</View>
      {review.loading && <ActivityIndicator accessibilityLabel="Consultando denuncias" color="#74C69D" />}
      {!!review.error && <><Text accessibilityRole="alert" style={styles.error}>{review.error}</Text>
        <Pressable accessibilityRole="button" style={styles.button} onPress={review.retry}><Text style={styles.buttonText}>Reintentar</Text></Pressable></>}
      {review.allowed && !review.selectedId && <>
        {!review.loading && !review.error && !review.entries.length && <Text style={styles.text}>{review.history ? 'No hay resoluciones en este campus.' : 'No hay denuncias en este campus.'}</Text>}
        {review.entries.map(entry => <Pressable key={entry.id} accessibilityRole="button" style={styles.card} onPress={() => review.open(entry.id)}>
          <Text style={styles.heading}>{entry.title ?? reviewLabels[entry.entityType] ?? 'Contenido denunciado'}</Text>
          <Text style={styles.text}>{reviewLabels[entry.entityType] ?? entry.entityType} · {reviewLabels[entry.status] ?? entry.status}</Text>
          <Text selectable style={styles.text}>Referencia del contenido: {entry.entityId}</Text>
          <Text style={styles.text}>{entry.reason}</Text>
          {review.history && 'resolution' in entry ? <>
            <Text style={styles.text}>Fecha de decisión: {entry.resolution.resolvedAt ? new Date(entry.resolution.resolvedAt).toLocaleString('es-CL') : 'Sin fecha registrada'}</Text>
            <Text selectable style={styles.text}>Administrador responsable: {entry.resolution.resolvedById ?? 'Sin responsable registrado'}</Text>
          </> : <Text style={styles.text}>{new Date(entry.reportedAt).toLocaleString('es-CL')}</Text>}
          <Text style={styles.link}>{review.history ? 'Consultar resolución' : 'Revisar denuncia'}</Text>
        </Pressable>)}
        <View style={styles.choices}>
          <Pressable accessibilityRole="button" disabled={review.loading || review.page === 1} style={[styles.button, review.page === 1 && styles.disabled]} onPress={() => review.changePage(review.page - 1)}><Text style={styles.buttonText}>Anterior</Text></Pressable>
          <Text style={styles.text}>Página {review.page}</Text>
          <Pressable accessibilityRole="button" disabled={review.loading || !review.hasMore} style={[styles.button, !review.hasMore && styles.disabled]} onPress={() => review.changePage(review.page + 1)}><Text style={styles.buttonText}>Siguiente</Text></Pressable>
        </View>
      </>}
      {!!review.selectedId && <>
        <Pressable accessibilityRole="button" style={styles.button} onPress={review.close}><Text style={styles.buttonText}>Volver al listado</Text></Pressable>
        {detail && <View style={styles.card}>
          <Text style={styles.heading}>{detail.title ?? 'Contenido denunciado'}</Text>
          <Text selectable style={styles.text}>Referencia del contenido: {detail.entityId}</Text>
          <Text style={styles.text}>Estado: {reviewLabels[detail.status] ?? detail.status}</Text>
          <Text style={styles.text}>Fecha: {new Date(detail.reportedAt).toLocaleString('es-CL')}</Text>
          <Text selectable style={styles.text}>Denunciante: {detail.reporter.name ?? detail.reporter.id}</Text>
          <Text style={styles.heading}>Motivo</Text><Text selectable style={styles.text}>{detail.reason}</Text>
          {!!detail.description && <Text selectable style={styles.text}>{detail.description}</Text>}
          <Text style={styles.heading}>Contenido al momento de la denuncia</Text>
          <Evidence value={detail.snapshot} />
          {!review.history && !!detail.currentPublication && <><Text style={styles.heading}>Publicación actual</Text><Evidence value={detail.currentPublication} /></>}
          {!review.history && !!detail.currentTransaction && <><Text style={styles.heading}>Antecedentes actuales del acuerdo</Text><Evidence value={detail.currentTransaction} /></>}
          {!!files.length && <><Text style={styles.heading}>Archivos denunciados</Text><Text style={styles.text}>Acceso reservado a la administración de este campus.</Text></>}
          {files.map(file => <Pressable key={file.id} accessibilityRole="button" disabled={Boolean(review.downloading)} style={styles.button}
            onPress={() => void review.download(file.id, file.name)}><Text style={styles.buttonText}>{review.downloading ? 'Descargando…' : `Descargar ${file.name}`}</Text></Pressable>)}
          {detail.resolution && <View style={styles.fields}>
            <Text style={styles.heading}>{detail.status === 'EN_REVISION' ? 'Decisión en curso' : 'Resolución registrada'}</Text>
            <Text style={styles.text}>Resultado: {reviewLabels[detail.status] ?? detail.status}</Text>
            <Text style={styles.text}>Medida aplicada: {detail.resolution.measure === 'OCULTAR' ? 'Ocultar el contenido' : detail.resolution.measure === 'NINGUNA' ? 'Ninguna' : detail.resolution.measure ?? 'Sin medida registrada'}</Text>
            <Text selectable style={styles.text}>Justificación: {detail.resolution.justification ?? 'Sin justificación registrada'}</Text>
            <Text selectable style={styles.text}>Administrador responsable: {detail.resolution.resolvedById ?? 'Sin responsable registrado'}</Text>
            <Text style={styles.text}>Fecha de decisión: {detail.resolution.resolvedAt ? new Date(detail.resolution.resolvedAt).toLocaleString('es-CL') : 'Sin fecha registrada'}</Text>
          </View>}
          {review.canResolve && <View style={styles.fields}>
            <Text style={styles.heading}>Resolver denuncia</Text>
            {review.resolutionInProgress ? <Text style={styles.text}>La decisión ya está registrada. Completa el ocultamiento para cerrar el caso.</Text> : <>
              <View style={styles.choices}>{(['DESESTIMAR', 'ACOGER'] as const).map(decision => <Pressable key={decision} accessibilityRole="button"
                accessibilityState={{ selected: review.resolutionInput.decision === decision }} disabled={review.resolving || review.resolutionNeedsReload}
                style={[styles.button, review.resolutionInput.decision === decision && styles.active]}
                onPress={() => review.editResolution({ decision })}><Text style={styles.buttonText}>{decision === 'DESESTIMAR' ? 'Desestimar' : 'Acoger y ocultar'}</Text></Pressable>)}</View>
              <Text style={styles.label}>Justificación obligatoria</Text>
              <TextInput accessibilityLabel="Justificación de la resolución" multiline maxLength={2000} style={styles.input}
                editable={!review.resolving && !review.resolutionNeedsReload} value={review.resolutionInput.justification}
                onChangeText={justification => review.editResolution({ justification })} placeholder="Explica la decisión" placeholderTextColor="#A0B9C7" />
            </>}
            {!!review.resolutionError && <Text accessibilityRole="alert" style={styles.error}>{review.resolutionError}</Text>}
            {review.resolutionNeedsReload ? <Pressable accessibilityRole="button" style={styles.button} onPress={review.retry}><Text style={styles.buttonText}>Actualizar caso</Text></Pressable>
              : review.confirmingResolution ? <>
                <Text style={styles.text}>{review.resolutionInput.decision === 'ACOGER'
                  ? 'El contenido dejará de mostrarse públicamente. Se conservarán solicitudes, transacciones, inscripciones y accesos adquiridos.'
                  : 'La denuncia quedará desestimada y el contenido conservará su estado.'} La resolución será definitiva.</Text>
                <View style={styles.choices}>
                  <Pressable accessibilityRole="button" disabled={review.resolving} style={styles.button} onPress={() => void review.confirmResolution()}><Text style={styles.buttonText}>{review.resolving ? 'Registrando…' : 'Confirmar resolución'}</Text></Pressable>
                  <Pressable accessibilityRole="button" disabled={review.resolving} style={styles.button} onPress={review.cancelResolution}><Text style={styles.buttonText}>Cancelar</Text></Pressable>
                </View>
              </> : <Pressable accessibilityRole="button" style={styles.button} onPress={review.requestResolution}><Text style={styles.buttonText}>{review.resolutionInProgress ? 'Completar resolución' : 'Revisar decisión'}</Text></Pressable>}
          </View>}
        </View>}
      </>}
    </ScrollView>
    <BottomNavigationBar />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071A2B' },
  content: { padding: 24, paddingTop: 48, paddingBottom: 130, gap: 16, width: '100%', maxWidth: 980, alignSelf: 'center' },
  eyebrow: { color: '#74C69D', fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  title: { color: '#FFF', fontSize: 30, fontWeight: '800' }, heading: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  text: { color: '#C5D5DE', fontSize: 15, lineHeight: 22, flexShrink: 1 }, label: { color: '#74C69D', fontSize: 13, fontWeight: '600' },
  card: { borderRadius: 16, backgroundColor: '#112C40', padding: 20, gap: 12 },
  fields: { gap: 10, flexShrink: 1 }, field: { borderLeftWidth: 1, borderLeftColor: '#365166', paddingLeft: 10, gap: 4 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  button: { padding: 12, backgroundColor: '#234459', borderRadius: 10 }, active: { backgroundColor: '#237660' },
  buttonText: { color: '#FFF', fontWeight: '600', flexShrink: 1 }, link: { color: '#74C69D', fontWeight: '700' },
  disabled: { opacity: 0.4 }, error: { color: '#FFB8B8', fontSize: 15 },
  input: { color: '#FFF', backgroundColor: '#071A2B', borderWidth: 1, borderColor: '#365166', borderRadius: 10, padding: 12, minHeight: 100, textAlignVertical: 'top' },
});
