import { Text, View } from 'react-native';
import { Camera, Download, EyeOff, FileText, Image as ImageIcon, MapPin } from 'lucide-react-native';
import type { useReportReviews } from '../hooks/useReportReviews';
import { reportContent } from '../utils/reportContent';
import { evidenceLabels, isEvidenceReference, reportBytes, reportDate } from '../utils/reportPresentation';
import { ReportEvidence } from './ReportEvidence';
import { ReportButton, ReportIcon } from './ReportUI';
import { reportStyles as s } from './reports.styles';
import { reportDetailStyles as d } from './reportDetail.styles';

type Review = ReturnType<typeof useReportReviews>;
const presented = new Set(['titulo', 'title', 'descripcion', 'description', 'files', 'images', 'precio', 'modalidad', 'estado_uso', 'tipo_recurso', 'estado_publicacion', 'status', 'campus_nombre', 'updated_at', 'updatedAt']);

/** Ficha del snapshot, sin peticiones adicionales ni imágenes reconstruidas desde contenido actual. */
export function ReportOriginalContent({ review }: { review: Review }) {
  const detail = review.detail;
  if (!detail) return null;
  const saved = reportContent(detail), final = ['RESUELTO', 'DESESTIMADO'].includes(detail.status);
  const more = Object.fromEntries(Object.entries(saved.content ?? {}).filter(([key]) => evidenceLabels[key] && !isEvidenceReference(key) && !presented.has(key)));
  const activity = detail.entityType === 'ACTIVIDAD';
  const showImage = saved.publication && (saved.kind === 'Físico' || detail.entityType === 'PUBLICACION_FISICA');
  return <View style={d.snapshot}>
    <Text accessibilityRole="header" style={s.sectionTitle}>{activity ? 'Actividad denunciada' : 'Publicación denunciada'}</Text>
    <View style={d.originalNotice}>
      <ReportIcon icon={Camera} size={17} /><View style={[s.grow, s.field]}>
        <Text style={s.label}>Registro original</Text>
        <Text style={s.small}>{detail.snapshot ? `Así estaba el contenido al momento de la denuncia, el ${reportDate(detail.reportedAt)}.` : 'Sin antecedentes registrados. No se conserva una ficha original para este caso.'}</Text>
      </View>
    </View>
    {saved.content ? <View style={d.preview}>
      {!!showImage && <View style={d.imagePlaceholder}>
        <ReportIcon icon={ImageIcon} size={34} /><Text style={s.small}>{saved.images.length ? 'Vista de imagen no disponible' : 'Sin imágenes registradas'}</Text>
        {!!saved.images.length && <View style={d.imageCount}><Text style={d.imageCountText}>{saved.images.length} {saved.images.length === 1 ? 'imagen registrada' : 'imágenes registradas'}</Text></View>}
      </View>}
      <View style={d.previewBody}>
        <Text accessibilityRole="header" style={s.heading}>{saved.title}</Text>
        {saved.price !== null && <Text style={d.price}>{saved.price}</Text>}
        <View style={d.tags}>
          {[saved.modality, saved.condition, saved.kind].filter((value): value is string => !!value).map((tag, index) => <View key={`${tag}:${index}`} style={d.tag}><Text style={d.tagText}>{tag}</Text></View>)}
          {!!saved.state && <View style={[d.tag, ['Disponible', 'Activa'].includes(saved.state) && d.stateTag]}><Text style={d.tagText}>{saved.state}</Text></View>}
        </View>
        {!!saved.savedCampus && <View style={s.row}><ReportIcon icon={MapPin} size={15} /><Text style={s.small}>{saved.savedCampus}</Text></View>}
        {!!saved.description && <Text selectable style={s.body}>{saved.description}</Text>}
        {saved.updatedAt !== null && <View style={d.footer}><Text style={[s.small, s.grow]}>Última edición guardada</Text><Text style={[s.small, s.grow]}>{reportDate(saved.updatedAt)}</Text></View>}
      </View>
    </View> : <ReportEvidence value={detail.snapshot} />}
    {!!Object.keys(more).length && <ReportEvidence value={more} />}
    {!!detail.snapshot?.transaction && <View style={s.smallStack}><Text accessibilityRole="header" style={s.label}>Intercambio al denunciar</Text><ReportEvidence value={detail.snapshot.transaction} /></View>}
    {Array.isArray(detail.snapshot?.confirmations) && <View style={s.smallStack}><Text style={s.label}>Confirmaciones guardadas</Text><ReportEvidence value={detail.snapshot.confirmations} /></View>}
    {!!saved.files.length && <View style={s.stack}>
      <Text accessibilityRole="header" style={s.label}>Archivos originales</Text>
      {!final && <Text style={s.small}>En el teléfono puedes compartir el archivo o elegir dónde guardarlo.</Text>}
      {saved.files.map(file => <View key={file.id} style={s.file}>
        <View style={s.topRow}><ReportIcon icon={FileText} /><View style={[s.grow, s.field]}><Text style={s.label}>{file.name}</Text>
          <Text style={s.small}>{[file.mimeType === 'application/pdf' ? 'PDF' : file.mimeType, typeof file.sizeBytes === 'number' ? reportBytes(file.sizeBytes) : null].filter(Boolean).join(' · ')}</Text>
        </View></View>
        {!final && <ReportButton secondary icon={Download} disabled={review.downloading} busy={review.downloading && review.downloadFileId === file.id}
          onPress={() => void review.download(file.id, file.name)}>{review.downloading && review.downloadFileId === file.id ? 'Preparando archivo…' : `Descargar ${file.name}`}</ReportButton>}
        {!final && review.downloadFileId === file.id && !!review.downloadError && <Text accessibilityRole="alert" style={[s.body, s.errorText]}>{review.downloadError}</Text>}
      </View>)}
    </View>}
    {final && detail.resolution?.measure === 'OCULTAR' && <View style={d.originalNotice}><ReportIcon icon={EyeOff} size={17} /><Text style={[s.small, s.grow]}>La resolución registró el ocultamiento de este contenido.</Text></View>}
  </View>;
}
