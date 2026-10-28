import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { Link } from 'expo-router';
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown, ChevronRight, ChevronUp, ClipboardList, FileText, Flag, History, ListChecks, MapPin, RefreshCw, ShieldCheck, TriangleAlert, UserRound, UsersRound, type LucideIcon } from 'lucide-react-native';
import { Pagination } from '@/components/Pagination';
import { RefreshScrollView } from '@/components/RefreshScrollView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import { safeAreaInset } from '@/lib/layout/safeArea';
import { accessLabels } from '../types/access';
import { auditLabels, type AuditDetail, type AuditEntry, type AuditReference } from '../types/audit';
import { useAuditHistory } from '../hooks/useAuditHistory';
import { auditStyles as styles, auditColors as colors } from './audit.styles';
import { AuditHistoryFilters, AuditHistoryFilterSummary } from './AuditHistoryFilters';
import { AuditReferenceValue } from './AuditReferenceValue';
import { AuditResponsibleBanner } from './AuditResponsibleBanner';
import { AuditActorAssignments } from './AuditActorAssignments';
import { AuditReportDetails } from './AuditReportDetails';
import { isAuditReportResolution } from '../utils/auditReportPresentation';
import { AuditActivityParticipation } from './AuditActivityParticipation';
import { AuditActivitySeries } from './AuditActivitySeries';
import { AuditEditTimeline } from './AuditEditTimeline';
import { AuditImageContext, AuditPublicationImages } from './AuditPublicationImages';
import { AuditPublicationDetails, AuditPublicationChangeValue } from './AuditPublicationDetails';
import { isAuditPublication, auditPublicationChanges, type AuditSide } from '../utils/auditPublicationPresentation';
import { auditAccessSummary, auditEntryTitle } from '../utils/auditAccessPresentation';
import { auditAssignmentNames, auditChangedFields, auditChangeValue, auditInformationFields, usesAuditComparison, type AuditFieldChange } from '../utils/auditDetailPresentation';

const label = (value: string) => accessLabels[value] ?? auditLabels[value] ?? value;
function day(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}
function time(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function actionIcon(action: string): LucideIcon {
  if (action.includes('ROL') || action.includes('PERMISO')) return UsersRound;
  if (action.includes('CUENTA')) return UserRound;
  if (action.includes('DENUNCIA')) return Flag;
  if (action.includes('PUBLICACION')) return FileText;
  if (action.includes('ACTIVIDAD') || action.includes('EVENTO_OFICIAL')) return CalendarDays;
  return History;
}
function Icon({ icon: Component, size = 20, color = colors.PRIMARY }: { icon: LucideIcon; size?: number; color?: string }) {
  return <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.icon}>
    <Component size={size} color={color} strokeWidth={1.8} />
  </View>;
}

/** Mantiene orden, alcance por campus y snapshots originales entregados por la API. */
export function AuditHistoryScreen() {
  const { campuses, campusId, action, dates, search, applyFilters, page, setPage, entries, selected, setSelected, loading,
    error, setReload, refresh, select, reportError, totalPages } = useAuditHistory();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const insets = useSafeAreaInsets();
  const resetScroll = () => scroll.current?.scrollTo({ y: 0, animated: false });
  const open = async (id: string) => {
    setOpeningId(id);
    try { await select(id); } finally { setOpeningId(null); }
  };
  const changePage = (next: number) => {
    if (loading || !Number.isSafeInteger(next) || next < 1 || next > totalPages || next === page) return;
    resetScroll(); setPage(next);
  };

  return <View style={styles.screen}>
    <RefreshScrollView ref={scroll} style={styles.scroll}
      onRefresh={refresh} refreshing={loading} refreshEnabled={!loading && !selected}
      refreshLabel="el historial administrativo" indicatorColor={colors.PRIMARY} refreshIndicatorOffset={insets.top + 8}
      contentContainerStyle={[styles.scrollContent, {
      paddingTop: safeAreaInset('top', insets.top, { offset: 12 }),
      paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 24, base: 16 }),
      paddingLeft: safeAreaInset('left', insets.left, { min: 16 }),
      paddingRight: safeAreaInset('right', insets.right, { min: 16 }),
    }]}>
      <View style={styles.content}>
        <View style={styles.navigation}>
          <Link href="/profile" asChild>
            <TouchableOpacity accessibilityRole="link" activeOpacity={0.65} style={styles.back}>
              <Icon icon={ArrowLeft} size={19} /><Text style={styles.backText}>Mi perfil</Text>
            </TouchableOpacity>
          </Link>
          <Text style={styles.eyebrow}>ADMINISTRACIÓN</Text>
        </View>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text accessibilityRole="header" style={styles.title}>Historial administrativo</Text>
            <Text style={styles.description}>Consulta las acciones y los cambios realizados en tus campus.</Text>
          </View>
        </View>

        <View style={styles.recordHeading}>
          <View style={styles.sectionHeading}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Registro de acciones</Text>
            <Text style={styles.pageLabel}>Página {page}</Text>
          </View>
          {!!campuses.length && <View style={styles.recordFilterRow}>
            <View style={styles.recordFilterSummary}><AuditHistoryFilterSummary campuses={campuses} campusId={campusId} action={action} dates={dates} search={search} /></View>
            <AuditHistoryFilters campuses={campuses} campusId={campusId} action={action} dates={dates} search={search}
              onChange={(id, nextAction, nextDates, nextSearch) => { resetScroll(); applyFilters(id, nextAction, nextDates, nextSearch); }} />
          </View>}
        </View>
        {!!error && <View style={styles.errorCard}>
          <View style={styles.inline}><Icon icon={TriangleAlert} color="#9B3C24" /><Text accessibilityRole="header" style={styles.errorTitle}>No pudimos cargar el registro</Text></View>
          <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
          {!loading && <TouchableOpacity accessibilityRole="button" activeOpacity={0.65} style={styles.retry} onPress={() => setReload(value => value + 1)}>
            <Icon icon={RefreshCw} size={16} /><Text style={styles.buttonText}>Reintentar</Text>
          </TouchableOpacity>}
        </View>}
        {loading && !entries.length && <HistorySkeleton />}
        {!loading && !error && !campuses.length && <EmptyState noCampus />}
        {!loading && !error && !!campusId && !entries.length && <EmptyState filtered={!!(action || dates.from || dates.to || search.contentName || search.userName)} />}

        {!!entries.length && <View>
          {entries.map((entry, index) => <View key={entry.id}>
            {(index === 0 || day(entries[index - 1].created_at) !== day(entry.created_at)) &&
              <Text accessibilityRole="header" style={styles.dateHeading}>{day(entry.created_at)}</Text>}
            <HistoryRow entry={entry} disabled={loading} opening={openingId === entry.id && loading} onPress={() => void open(entry.id)} />
          </View>)}
        </View>}

        {!loading && !error && !!campusId && entries.length > 0 && <View style={styles.pagination}>
          <Pagination page={page} totalPages={totalPages} onPageChange={changePage} label="Páginas del registro de acciones" />
        </View>}
        {!error && !!entries.length && <View style={styles.historyNote}>
          <Icon icon={ShieldCheck} size={16} color={colors.muted} /><Text style={styles.noteText}>Consulta los cambios registrados y su información histórica disponible.</Text>
        </View>}
      </View>
    </RefreshScrollView>
    {selected && <HistoryDetail key={selected.id} entry={selected} campusName={campuses.find(campus => campus.id === selected.campus_id)?.name} onClose={() => setSelected(null)} onAccessError={reportError} />}
  </View>;
}

function HistoryRow({ entry, disabled, opening, onPress }: { entry: AuditEntry; disabled: boolean; opening: boolean; onPress: () => void }) {
  return <View style={styles.timelineRow}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={auditEntryTitle(entry) + (entry.activitySeries ? `. ${entry.activitySeries.count} ocurrencias` : '') + '. ' + day(entry.created_at) + ', ' + time(entry.created_at) + '. Ver detalle'}
      accessibilityState={{ disabled, busy: opening }} disabled={disabled} activeOpacity={0.7} style={styles.actionCard} onPress={onPress}>
      <View style={styles.rowTop}>
        <View style={styles.actionIcon}><Icon icon={actionIcon(entry.accion)} size={16} /></View>
        <Text style={styles.entityType}>{label(entry.entidad_tipo)}</Text><Text style={styles.time}>{time(entry.created_at)}</Text>
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{auditEntryTitle(entry)}</Text>
        {!!entry.entity_name && <Text style={styles.contentName}>{entry.entity_name}</Text>}
      </View>
      {entry.accessGroup && <View style={styles.groupSummary}>
        <Text style={styles.groupCount}>{entry.accessGroup.count} cambios en una operación</Text>
        <Text style={styles.valueMuted}>{auditAccessSummary(entry.accessGroup)}</Text>
      </View>}
      {entry.activitySeries && <Text style={styles.groupCount}>{entry.activitySeries.count} {entry.activitySeries.count === 1 ? 'ocurrencia en esta serie' : 'ocurrencias en esta serie'}</Text>}
      {entry.editGroup && <Text style={styles.groupCount}>{entry.editGroup.count} ediciones coincidentes · Ver línea de tiempo</Text>}
      <View style={styles.cardDetailLink}>{opening ? <ActivityIndicator size="small" color={colors.PRIMARY} accessibilityLabel="Abriendo detalle" />
        : <><Text style={styles.detailLink}>Ver detalle</Text><Icon icon={ChevronRight} size={13} /></>}</View>
      <AuditResponsibleBanner actorId={entry.actor_usuario_id} actor={entry.actor} caption={entry.editGroup ? 'Última edición del grupo' : 'Responsable'} />
    </TouchableOpacity>
  </View>;
}

function EmptyState({ noCampus = false, filtered = false }: { noCampus?: boolean; filtered?: boolean }) {
  return <View style={styles.empty}>
    <View style={styles.emptyIcon}><Icon icon={noCampus ? MapPin : History} size={28} /></View>
    <Text accessibilityRole="header" style={styles.emptyTitle}>{noCampus ? 'Sin campus disponibles' : filtered ? 'Sin resultados' : 'Aún no hay acciones'}</Text>
    <Text style={styles.emptyText}>{noCampus ? 'No tienes campus activos para administrar.' : filtered ? 'No hay registros que coincidan con los filtros en el campus seleccionado. Prueba otros nombres, fechas o tipos de acción.' : 'Las acciones administrativas de este campus aparecerán aquí.'}</Text>
  </View>;
}
function HistorySkeleton() {
  return <Skeleton label="Cargando historial administrativo" contentStyle={styles.skeleton}>
    <SkeletonBlock width={154} height={12} />
    {[0, 1, 2].map(index => <View key={index} style={styles.skeletonCard}>
      <View style={styles.inline}><SkeletonBlock width={36} height={36} borderRadius={12} /><SkeletonBlock width="35%" height={12} /></View>
      <SkeletonBlock width="80%" height={17} /><SkeletonBlock width="55%" height={12} />
      <SkeletonBlock width="90%" height={12} />
    </View>)}
  </Skeleton>;
}

function HistoryDetail({ entry, campusName, onClose, onAccessError }: { entry: AuditDetail; campusName?: string; onClose: () => void; onAccessError: (error: unknown) => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <View style={[styles.screen, {
      paddingTop: safeAreaInset('top', insets.top), paddingLeft: safeAreaInset('left', insets.left), paddingRight: safeAreaInset('right', insets.right),
    }]} accessibilityViewIsModal onAccessibilityEscape={onClose}>
      <View style={styles.detailHeader}>
        <View style={styles.detailHeaderContent}>
          <Text accessibilityRole="header" style={styles.detailHeaderTitle}>Detalle de la acción</Text>
        </View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.detailScrollContent, { paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 24 }) }]}>
        <View style={styles.detailContent}>
          <View style={styles.detailHero}>
            <View style={styles.detailHeroIcon}><Icon icon={actionIcon(entry.accion)} size={26} /></View>
            <Text style={styles.eyebrow}>REGISTRO HISTÓRICO</Text>
            <Text accessibilityRole="header" style={styles.detailTitle}>{auditEntryTitle(entry)}</Text>
            <Text style={styles.description}>{entry.editGroup ? 'Edición del listado · ' : ''}{day(entry.created_at)} · {time(entry.created_at)}</Text>
            {entry.accessGroup && <View style={styles.groupDetail}>
              <Text style={styles.groupCount}>{entry.accessGroup.count} cambios en una operación</Text>
              <Text style={styles.groupDetailText}>{auditAccessSummary(entry.accessGroup)}</Text>
            </View>}
            {entry.activitySeries && <View style={styles.groupDetail}><Text style={styles.groupCount}>{entry.activitySeries.count} {entry.activitySeries.count === 1 ? 'ocurrencia publicada' : 'ocurrencias publicadas'}</Text></View>}
            <View style={styles.detailCampus}><Icon icon={MapPin} size={14} /><Text selectable style={styles.detailCampusText}>{campusName ?? entry.campus_id}</Text></View>
          </View>
          {entry.editGroup ? <>
            <View style={styles.metadata}><Metadata title="Contenido editado" value={entry.entidad_id} reference={entry.references?.entidad_id} icon={actionIcon(entry.accion)} /></View>
            <AuditEditTimeline entry={entry} onAccessError={onAccessError} renderDetails={version => <ActionDetails entry={version} campusName={campusName} wide={width >= 760} onAccessError={onAccessError} />} />
          </> : <ActionDetails entry={entry} campusName={campusName} wide={width >= 760} onAccessError={onAccessError} />}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver al historial" activeOpacity={0.65} style={styles.returnButton} onPress={onClose}>
            <Icon icon={ArrowLeft} size={18} /><Text style={styles.buttonText}>Volver al historial</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  </Modal>;
}
function ActionDetails({ entry, campusName, wide, onAccessError }: { entry: AuditDetail; campusName?: string; wide: boolean; onAccessError: (error: unknown) => void }) {
  const comparison = usesAuditComparison(entry.accion);
  const publication = isAuditPublication(entry);
  const reportEntity = entry.entidad_tipo === 'reporte_contenido';
  const associatedReport = entry.reporte_contenido_id && (!reportEntity || entry.reporte_contenido_id.toLowerCase() !== entry.entidad_id.toLowerCase());
  return <AuditImageContext.Provider value={['publicacion_recurso', 'PUBLICACION_FISICA'].includes(entry.entidad_tipo)
    ? { campusId: entry.campus_id, auditId: entry.id, onAccessError } : null}>
    <View style={{ gap: 22 }}>
      <View style={styles.metadata}>
        <ResponsibleProfile entry={entry} />
        <AuditActorAssignments actorId={entry.actor_usuario_id} actor={entry.actor} />
        {entry.activitySeries
          ? <Metadata title="Serie recurrente" value={entry.activitySeries.seriesId} reference={{ kind: 'activity', id: entry.activitySeries.seriesId,
            name: entry.entity_name ?? null, source: entry.references?.entidad_id?.source ?? 'unavailable' }} icon={CalendarDays} />
          : (!publication || !comparison) && <Metadata title={reportEntity ? 'Denuncia' : label(entry.entidad_tipo) + (entry.entidad_tipo === 'evento_oficial' ? ' afectado' : ' afectada')} value={entry.entidad_id} reference={entry.references?.entidad_id} icon={actionIcon(entry.accion)} hideMissingName={reportEntity} />}
        {!!associatedReport && <Metadata title="Denuncia asociada" value={entry.reporte_contenido_id!} reference={entry.references?.reporte_contenido_id} icon={Flag} hideMissingName />}
      </View>
      {entry.activitySeries && <AuditActivitySeries campusId={entry.campus_id} auditId={entry.id} total={entry.activitySeries.count} onAccessError={onAccessError}
        renderDetails={occurrence => <>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Datos al publicar esta ocurrencia</Text>
          <ActivitySnapshotNotice entry={occurrence} />
          <RecordedDetails entry={occurrence} wide={wide} />
          <AuditActivityParticipation campusId={occurrence.campus_id} auditId={occurrence.id} onAccessError={onAccessError} />
        </>} />}
      {isAuditReportResolution(entry.accion) && <AuditReportDetails entry={entry} campusName={campusName} />}
      {publication && !comparison && <AuditPublicationDetails entry={entry} renderValue={(value,path)=><SnapshotValue value={value} path={path} references={entry.references} />} />}
      {!entry.activitySeries && !isAuditReportResolution(entry.accion) && (!publication || comparison) && <>
      {entry.activity?.kind === 'created' && <AuditActivityParticipation campusId={entry.campus_id} auditId={entry.id} onAccessError={onAccessError} />}
      {!!entry.justificacion_accion && <View style={styles.justification}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Justificación</Text>
        <Text selectable style={styles.value}>{entry.justificacion_accion}</Text>
      </View>}
      {comparison && <ChangeSummary entry={entry} />}
      <View style={styles.comparisonHeading}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{comparison ? 'Datos del cambio' : 'Información de la acción'}</Text>
        {comparison && <Text style={styles.description}>Compara la información anterior y posterior a la acción.</Text>}
        {entry.activity?.snapshotSource === 'current' && <Text style={styles.description}>Se muestran los datos actuales conservados. No hay una instantánea original registrada para esta acción.</Text>}
        {entry.activity?.snapshotSource === 'first_change' && <Text style={styles.fieldLabel}>Estado conservado antes del primer cambio registrado. Puede diferir de la publicación original.</Text>}
        {!comparison && !!entry.activity?.changedFields.length && <Text style={styles.value}>Campos modificados: {entry.activity.changedFields.map(label).join(', ')}.</Text>}
        {entry.activity?.revision !== undefined && <Text style={styles.fieldLabel}>Revisión {entry.activity.revision}{entry.activity.scope === 'UPCOMING' ? ' · Cambio histórico de próximas ocurrencias' : ' · Esta ocurrencia'}</Text>}
      </View>
      {comparison ? <View style={[styles.snapshots, wide && styles.snapshotsWide]}>
        <Snapshot title="Antes" caption="Estado anterior" path="datos_antes" value={entry.datos_antes} references={entry.references} wide={wide} publicationEntry={publication ? entry : undefined} />
        <Snapshot title="Después" caption="Estado posterior" path="datos_despues" value={entry.datos_despues} references={entry.references} wide={wide} after publicationEntry={publication ? entry : undefined} />
      </View> : <RecordedDetails entry={entry} wide={wide} />}
      </>}
    </View>
  </AuditImageContext.Provider>;
}

function ActivitySnapshotNotice({ entry }: { entry: AuditDetail }) {
  return entry.activity?.snapshotSource === 'current'
    ? <Text style={styles.description}>Se muestran los datos actuales conservados. No hay una instantánea original registrada para esta acción.</Text>
    : entry.activity?.snapshotSource === 'first_change'
      ? <Text style={styles.fieldLabel}>Estado conservado antes del primer cambio registrado. Puede diferir de la publicación original.</Text> : null;
}
function ResponsibleProfile({ entry }: { entry: AuditDetail }) {
  const profile = entry.responsibleProfile;
  const reference = entry.references?.actor_usuario_id;
  const fullName = profile?.fullName ?? entry.actor?.name ?? (reference?.id === entry.actor_usuario_id ? reference?.name : null);
  return <View style={styles.metadataRow}>
    <Icon icon={UserRound} size={17} color={colors.muted} />
    <View style={styles.metadataCopy}>
      <Text style={styles.fieldLabel}>Responsable de la acción</Text>
      <View style={styles.responsibleFields}>
        <View style={styles.field}><Text style={styles.fieldLabel}>Nombre completo</Text>
          <Text selectable style={styles.referenceName}>{fullName ?? 'Nombre no disponible'}</Text>
          <Text selectable style={styles.referenceId}>ID: {entry.actor_usuario_id ?? 'No registrado'}</Text>
        </View>
        <View style={styles.field}><Text style={styles.fieldLabel}>Correo registrado</Text>
          <Text selectable style={styles.value}>{profile?.email ?? 'Correo no disponible'}</Text>
        </View>
        <View style={styles.field}><Text style={styles.fieldLabel}>{profile?.careers.length === 1 ? 'Carrera registrada' : 'Carreras registradas'}</Text>
          {profile?.careers.length ? profile.careers.map(career => <AuditReferenceValue key={career.id} id={career.id}
            reference={{ kind: 'career', id: career.id, name: career.name, source: 'current' }} />)
            : <Text style={styles.valueMuted}>{profile ? 'Sin carreras registradas' : 'Carreras no disponibles'}</Text>}
        </View>
      </View>
    </View>
  </View>;
}
function Metadata({ title, value, icon, reference, hideMissingName = false }: { title: string; value: string; icon: LucideIcon; reference?: AuditReference; hideMissingName?: boolean }) {
  return <View style={styles.metadataRow}><Icon icon={icon} size={17} color={colors.muted} />
    <View style={styles.metadataCopy}><Text style={styles.fieldLabel}>{title}</Text>
      {hideMissingName && (reference?.id !== value || !reference.name?.trim())
        ? <Text selectable style={styles.referenceId}>ID: {value}</Text> : <AuditReferenceValue id={value} reference={reference} />}
    </View>
  </View>;
}

/** Presenta valores registrados y mantiene la ruta original de cada referencia. */
function SnapshotValue({ value, path, references }: { value: unknown; path: string; references?: Record<string, AuditReference> }) {
  if (value === null || value === undefined) return <Text selectable style={styles.valueMuted}>Sin valor</Text>;
  if (Array.isArray(value) && /^datos_(antes|despues)\.images$/.test(path)) return <AuditPublicationImages value={value} />;
  if (Array.isArray(value) && /^datos_(antes|despues)\.(roles|permissions)$/.test(path)) {
    const roles = path.endsWith('.roles');
    const names = auditAssignmentNames(value, path, references);
    return names.length ? <View style={styles.assignmentList}>
      {names.map((name, index) => <Text key={index} selectable style={name ? styles.assignmentName : styles.valueMuted}>
        {name ? label(name) : roles ? 'Rol no disponible' : 'Permiso no disponible'}
      </Text>)}
    </View> : <Text style={styles.valueMuted}>{roles ? 'Sin roles asignados' : 'Sin permisos asignados'}</Text>;
  }
  if (typeof value === 'string' && references?.[path]) return <AuditReferenceValue id={value} reference={references[path]} />;
  if (Array.isArray(value)) return value.length ? <View style={styles.nestedGroup}>{value.map((item, index) =>
    <View key={index} style={styles.nestedItem}><SnapshotValue value={item} path={path + '.' + index} references={references} /></View>)}</View>
    : <Text style={styles.valueMuted}>Sin asignaciones o registros.</Text>;
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    const accessSnapshot = /^datos_(antes|despues)$/.test(path) && (Array.isArray(row.roles) || Array.isArray(row.permissions));
    const fields = Object.entries(row).filter(([key]) => !accessSnapshot || !['assignmentId', 'catalogId', 'action'].includes(key));
    return <View style={styles.nestedGroup}>{fields.map(([key, item]) =>
      <View key={key} style={styles.field}><Text style={styles.fieldLabel}>{label(key)}</Text><SnapshotValue value={item} path={path + '.' + key} references={references} /></View>)}</View>;
  }
  return <Text selectable style={styles.value}>{typeof value === 'boolean' ? value ? 'Sí' : 'No' : label(String(value))}</Text>;
}
function Snapshot({ title, caption, value, path, references, after = false, wide, publicationEntry }: { title: string; caption: string; value: Record<string, unknown> | null; path: string; references?: Record<string, AuditReference>; after?: boolean; wide: boolean; publicationEntry?: AuditDetail }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={[styles.snapshot, wide && styles.snapshotWide, after && styles.snapshotAfter]}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${expanded ? 'Contraer' : 'Expandir'} ${title}`}
      accessibilityState={{ expanded }} aria-expanded={expanded} activeOpacity={0.7} onPress={() => setExpanded(current => !current)}
      style={[styles.snapshotHeader, after && styles.snapshotHeaderAfter, !expanded && styles.snapshotHeaderCollapsed]}>
      <View style={styles.snapshotHeaderRow}>
        <View style={styles.inline}><Icon icon={after ? ArrowRight : History} size={17} /><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text></View>
        <Icon icon={expanded ? ChevronUp : ChevronDown} size={18} />
      </View>
      <Text style={styles.fieldLabel}>{caption}</Text>
    </TouchableOpacity>
    {expanded && <View style={styles.snapshotBody}>
      {!value || !Object.keys(value).length ? <Text style={styles.valueMuted}>Sin datos históricos disponibles.</Text>
        : publicationEntry ? <AuditPublicationDetails entry={publicationEntry} side={path as AuditSide} renderValue={(item,itemPath)=><SnapshotValue value={item} path={itemPath} references={references} />} />
          : <SnapshotValue value={value} path={path} references={references} />}
    </View>}
  </View>;
}

function ChangeSummary({ entry }: { entry: AuditDetail }) {
  const publication = isAuditPublication(entry), changes = publication ? auditPublicationChanges(entry) : auditChangedFields(entry);
  const { complete, fields } = changes;
  return <View style={styles.changeSummary}>
    <View style={styles.changeSummaryHeader}>
      <View style={styles.inline}><Icon icon={ListChecks} size={20} /><Text accessibilityRole="header" style={styles.sectionTitle}>¿Qué cambió?</Text></View>
      {publication && <Metadata title="Publicación afectada" value={entry.entidad_id} reference={entry.references?.entidad_id} icon={actionIcon(entry.accion)} />}
      <Text style={styles.valueMuted}>{!complete ? 'No hay suficientes datos históricos para comparar los campos.'
        : !fields.length ? 'No se encontraron diferencias entre los datos registrados.'
          : publication ? `Se actualizaron: ${fields.map(field=>field.path.map(label).join(' · ')).join(', ')}.`
            : `${fields.length === 1 ? 'Se afectó 1 campo' : `Se afectaron ${fields.length} campos`} en esta acción.`}</Text>
    </View>
    {!!fields.length && <View style={styles.changeSummaryFields}>
      {fields.map(field => <ChangeSummaryField key={JSON.stringify(field.path)} entry={entry} field={field} />)}
    </View>}
  </View>;
}

function ChangeSummaryField({ entry, field }: { entry: AuditDetail; field: AuditFieldChange }) {
  const [expanded, setExpanded] = useState(false);
  const title = field.path.map(label).join(' · ');
  const kinds = { added: 'Agregado', removed: 'Eliminado', modified: 'Modificado' };
  return <View>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${expanded ? 'Contraer' : 'Expandir'} cambio: ${title}`}
      accessibilityState={{ expanded }} aria-expanded={expanded} activeOpacity={0.7} onPress={() => setExpanded(current => !current)} style={styles.changeSummaryRow}>
      <View style={styles.changeSummaryDot} />
      <Text style={styles.changeSummaryName}>{title}</Text>
      <View style={[styles.changeKind, field.kind === 'added' && styles.changeKindAdded, field.kind === 'removed' && styles.changeKindRemoved]}>
        {field.kind !== 'modified' && <Text style={styles.changeKindText}>{kinds[field.kind]}</Text>}<Icon icon={expanded ? ChevronUp : ChevronDown} size={14} />
      </View>
    </TouchableOpacity>
    {expanded && <View style={styles.changeValues}>
      {(['datos_antes', 'datos_despues'] as const).map(side => {
        const item = auditChangeValue(entry, field.path, side);
        return <View key={side} style={[styles.changeValue, side === 'datos_despues' && styles.changeValueAfter]}>
          <Text style={styles.changeValueTitle}>{side === 'datos_antes' ? 'Original' : 'Nuevo'}</Text>
          {item.present ? isAuditPublication(entry)
            ? <AuditPublicationChangeValue entry={entry} value={item.value} path={item.path} renderValue={(value,path)=><SnapshotValue value={value} path={path} references={entry.references} />} />
            : <SnapshotValue value={item.value} path={item.path} references={entry.references} />
            : <Text style={styles.valueMuted}>Campo no registrado</Text>}
        </View>;
      })}
    </View>}
  </View>;
}

function RecordedDetails({ entry, wide }: { entry: AuditDetail; wide: boolean }) {
  const fields = auditInformationFields(entry);
  return <View style={styles.recordedCard}>
    <View style={styles.recordedHeader}><Icon icon={ClipboardList} size={18} /><Text accessibilityRole="header" style={styles.sectionTitle}>Datos registrados</Text></View>
    <View style={[styles.recordedBody, wide && styles.recordedBodyWide]}>
      {!fields.length && <Text style={styles.valueMuted}>Sin datos históricos disponibles.</Text>}
      {fields.map(field => <View key={field.key} style={[styles.recordedField, wide && styles.recordedFieldWide,
        wide && field.value !== null && typeof field.value === 'object' && styles.recordedFieldFull]}>
        <Text style={styles.fieldLabel}>{label(field.key)}</Text>
        <SnapshotValue value={field.value} path={field.path} references={entry.references} />
      </View>)}
    </View>
  </View>;
}
