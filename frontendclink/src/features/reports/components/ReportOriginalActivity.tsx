import { Text, View, useWindowDimensions } from 'react-native';
import { Camera, MapPin, UserRound } from 'lucide-react-native';
import { reportRecord, type ReportDetail } from '../utils/reportContent';
import { evidenceValue, reportDate } from '../utils/reportPresentation';
import { ReportEvidence } from './ReportEvidence';
import { ReportIcon } from './ReportUI';
import { reportDetailStyles as d } from './reportDetail.styles';
import { reportStyles as s } from './reports.styles';

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
function DateCard({ label, value, stacked }: { label: string; value: unknown; stacked: boolean }) {
  const date = typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value) : null;
  return <View style={[d.activityDate, stacked && d.activityDateStacked]}>
    <Text style={s.small}>{label}</Text>
    {date ? <>
      <Text selectable style={d.activityDay}>{date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</Text>
      <Text selectable style={d.activityDateTime}>{date.getFullYear()} · {date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
    </> : <Text style={s.body}>Fecha no registrada</Text>}
  </View>;
}

/** Ficha exclusiva del snapshot de actividad; nunca consulta mapa/actividad ni calcula su estado actual. */
export function ReportOriginalActivity({ detail }: { detail: ReportDetail }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 340 || fontScale > 1.35;
  const snapshot = reportRecord(detail.snapshot), location = reportRecord(snapshot?.location);
  const status = text(snapshot?.status), visibility = text(snapshot?.visibility), type = text(snapshot?.type);
  const building = text(location?.buildingName), floor = text(location?.floorName), poi = text(location?.poiName), custom = text(location?.customLabel);
  const place = poi ?? custom ?? floor ?? building;
  const path = (poi || custom ? [building, floor] : floor ? [building] : []).filter(Boolean).join(' › ');
  const person = detail.people?.reported, creator = text(snapshot?.createdByUserId);
  const knownCreator = !!creator && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(creator);
  const extra = Object.fromEntries(['category', 'tags', 'series', 'createdAt', 'updatedAt'].filter(key => snapshot && Object.hasOwn(snapshot, key)).map(key => [key, snapshot![key]]));
  return <View style={[d.snapshot, d.activitySnapshot]}>
    <View style={d.activityNotice}>
      <ReportIcon icon={Camera} size={17} /><View style={[s.grow, s.field]}>
        <Text style={d.activityNoticeText}><Text style={d.strong}>Registro original</Text> · {reportDate(detail.reportedAt)}</Text>
        <Text style={d.activityNoticeText}>{snapshot ? 'Así estaba el contenido al momento de la denuncia.' : 'Sin antecedentes registrados. No se conserva una ficha original para este caso.'}</Text>
      </View>
    </View>
    <View style={d.activityCard} accessibilityLabel="Actividad denunciada">
      <View style={d.tags}>
        <View style={[d.tag, status === 'ACTIVE' && d.stateTag]}><Text style={d.tagText}>{status ? evidenceValue('status', status) : 'Estado no registrado'}</Text></View>
        <View style={d.tag}><Text style={d.tagText}>{visibility ? evidenceValue('visibility', visibility) : 'Visibilidad no registrada'}</Text></View>
        <View style={d.tag}><Text style={d.tagText}>{type ? evidenceValue('type', type) : 'Tipo no registrado'}</Text></View>
      </View>
      <Text accessibilityRole="header" selectable style={d.activityTitle}>{text(snapshot?.title) ?? text(detail.title) ?? 'Actividad sin título registrado'}</Text>
      <Text selectable style={s.body}>{text(snapshot?.description) ?? 'Descripción no registrada'}</Text>
      <View style={d.activitySection}>
        <Text accessibilityRole="header" style={d.activitySectionLabel}>CUÁNDO</Text>
        <View style={[d.activityDates, stacked && d.activityDatesStacked]}>
          <DateCard label="Inicio" value={snapshot?.startAt} stacked={stacked} /><DateCard label="Término" value={snapshot?.endAt} stacked={stacked} />
        </View>
      </View>
      <View style={s.smallStack}>
        <Text accessibilityRole="header" style={d.activitySectionLabel}>DÓNDE</Text>
        <View style={d.activityLocation}><ReportIcon icon={MapPin} size={20} color="#1553A1" />
          <View style={[s.grow, s.field]}>
            <Text selectable style={s.label}>{place ?? 'Ubicación no registrada'}</Text>
            {!!path && <Text selectable style={d.activityDateTime}>{path}</Text>}
            {!!poi && !!custom && <Text selectable style={s.small}>{custom}</Text>}
          </View>
        </View>
      </View>
      <View style={d.activitySection}>
        <Text accessibilityRole="header" style={d.activitySectionLabel}>PROPIETARIO DE ACTIVIDAD</Text>
        <View style={d.activityOwner}>
          <View style={d.activityAvatar}><ReportIcon icon={UserRound} size={21} /></View>
          <View style={[s.grow, s.field]}>
            <Text selectable style={s.label}>{person?.name?.trim() || 'Nombre no disponible'}</Text>
            <Text selectable style={d.activityDateTime}>{person?.email?.trim() || 'Correo no disponible'}</Text>
            <Text style={s.small}>{knownCreator ? 'Organizador' : 'Relación no registrada'}</Text>
          </View>
        </View>
        <Text style={s.small}>Nombre y correo actuales del perfil.</Text>
      </View>
      {!!Object.keys(extra).length && <ReportEvidence value={extra} hideWithdrawal />}
    </View>
  </View>;
}
