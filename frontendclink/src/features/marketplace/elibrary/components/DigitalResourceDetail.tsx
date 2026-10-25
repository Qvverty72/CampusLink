import { safeAreaInset } from '@/lib/layout/safeArea';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { FileText, LockKeyhole } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { MarketplaceReportForm } from '../../components/MarketplaceReportForm';
import { CATALOG_COLORS as colors, PriceTag, StatusTag, ui } from '../../components/CatalogUI';
import { AgreementNotice, DetailActionBar, DetailHeader, DetailSection, OwnerCard, RequestMessageForm, RequestResourceSummary, ResourceDetailSkeleton, detailUI } from '../../components/ResourceDetailUI';
import type { useDigitalLibrary } from '../hooks/useDigitalLibrary';
import { useDigitalRequestAction } from '../hooks/useDigitalTrades';
import { DigitalPreview } from './DigitalPreview';
import { DigitalAcademicSelector } from './DigitalAcademicSelector';
import { DigitalPublicationEditor } from './DigitalPublicationEditor';

type Library = ReturnType<typeof useDigitalLibrary>;
export function DigitalResourceDetail({ library, onAcquired, onRequests }: { library: Library; onAcquired: (id: string) => void; onRequests: () => void }) {
  const insets = useSafeAreaInsets(), resource = library.detail;
  const request = useDigitalRequestAction(resource?.id ?? '', Boolean(resource && !library.isOwner));
  const [reporting, setReporting] = useState(false), [reportBusy, setReportBusy] = useState(false);
  const [requesting, setRequesting] = useState(false), [managing, setManaging] = useState(false), [contentEditor, setContentEditor] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = resource?.files.find(file => file.id === previewId) ?? resource?.files[0];
  const busy = library.busy || request.busy || reportBusy || Boolean(library.downloading);
  const acquired = !library.isOwner && Boolean(resource?.acquired || request.options?.acquired);
  const active = Boolean(request.options?.activeRequestId);
  const available = resource?.status === 'DISPONIBLE' && !resource.isWithdrawn;
  const canRequest = Boolean(available && request.options?.canRequest && !request.loading);
  const helper = library.isOwner ? 'No puedes solicitar tu propia publicación.' : acquired ? 'Tu acceso al archivo completo está guardado en tus materiales.'
    : active ? 'Ya tienes una solicitud registrada para este recurso.' : !available ? 'Este recurso ya no admite solicitudes.'
      : request.loading ? 'Comprobando tu acceso y solicitudes…' : request.error ? 'No pudimos comprobar el estado de tu solicitud.' : request.options && !request.options.canRequest ? 'Este recurso no admite nuevas solicitudes.' : null;
  const label = acquired ? 'Abrir en mis materiales' : active ? 'Ver mis solicitudes' : requesting ? request.busy ? 'Enviando solicitud…' : 'Enviar solicitud' : 'Solicitar este recurso';
  const disabled = busy || !resource || library.isOwner || (!acquired && !active && (!canRequest || (requesting && !request.code)));
  const goBack = () => {
    if (reporting) setReporting(false);
    else if (contentEditor) setContentEditor(false);
    else if (library.editingAcademics) library.cancelAcademics();
    else if (managing) setManaging(false);
    else if (requesting) setRequesting(false);
    else library.closeDetail();
  };
  return <View style={detailUI.page}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[detailUI.content, { paddingTop: safeAreaInset('top', insets.top, { min: 16, offset: 8 }), paddingBottom: 250 }]}>
      <DetailHeader onBack={goBack} disabled={busy} title={reporting ? 'Denunciar recurso' : managing ? 'Administrar publicación' : requesting ? 'Solicitar recurso' : 'Biblioteca'}
        onReport={resource && !reporting && !requesting && !managing ? () => setReporting(true) : undefined} />
      {!resource ? library.detailLoading ? <ResourceDetailSkeleton /> : <View style={detailUI.card}>
        <Text accessibilityRole="alert" style={detailUI.error}>{library.error || 'No pudimos abrir el recurso.'}</Text>
        <Pressable accessibilityRole="button" onPress={() => { if (library.selectedId) void library.openDetail(library.selectedId); }} style={ui.outlined}><Text style={ui.link}>Reintentar detalle</Text></Pressable>
      </View> : reporting ? <MarketplaceReportForm target={{ type: 'PUBLICACION_DIGITAL', publicationId: resource.id, campusId: resource.campusId }} title={resource.title} onBusyChange={setReportBusy} onBack={() => setReporting(false)} />
        : managing ? <>
          {library.error && <Text accessibilityRole="alert" style={detailUI.error}>{library.error}</Text>}
          {contentEditor ? <DigitalPublicationEditor key={resource.id} resource={resource} onSaved={value => { setContentEditor(false); library.savedContent(value); }} onClose={() => setContentEditor(false)} />
            : library.editingAcademics ? <>
              <DigitalAcademicSelector catalog={library.catalog} loading={library.catalogLoading} error={library.catalogError} reload={library.reloadCatalog}
                careerIds={library.careerIds} subjectIds={library.subjectIds} onCareersChange={library.setCareerIds} onSubjectsChange={library.setSubjectIds} disabled={busy} previous={resource} />
              {library.academicConflict && <Pressable accessibilityRole="button" disabled={busy} onPress={library.openAcademicEditor} style={ui.outlined}><Text style={ui.link}>Recargar asociaciones vigentes</Text></Pressable>}
              <Pressable accessibilityRole="button" disabled={busy || library.academicConflict || library.catalogLoading || Boolean(library.catalogError)} onPress={library.saveAcademics} style={ui.primary}><Text style={ui.primaryText}>Guardar asociaciones</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={library.cancelAcademics} style={ui.outlined}><Text style={ui.link}>Cancelar edición</Text></Pressable>
            </> : <>
              <Text style={detailUI.title}>{resource.title}</Text>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => setContentEditor(true)} style={ui.outlined}><Text style={ui.link}>Editar contenido o retirar publicación</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={library.openAcademicEditor} style={ui.outlined}><Text style={ui.link}>Editar asociaciones académicas</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={library.openAttachments} style={ui.outlined}><Text style={ui.link}>Añadir archivos</Text></Pressable>
              {resource.files.map(file => <Pressable key={file.id} accessibilityRole="button" accessibilityLabel={`Descargar ${file.name}`} disabled={busy} onPress={() => library.download(file)} style={ui.outlined}><Text style={ui.link}>{library.downloading === file.id ? 'Descargando…' : `Descargar ${file.name}`}</Text></Pressable>)}
            </>}
        </> : requesting ? <>
          <RequestResourceSummary title={resource.title} modality={resource.modality} price={resource.price} digital />
          {active || acquired ? <Text style={detailUI.body}>{acquired ? 'Ya adquiriste este recurso. Abre tus materiales para consultar los archivos.' : 'Tu solicitud está registrada. Puedes consultar tus solicitudes y acuerdos.'}</Text>
            : <RequestMessageForm title={resource.title} messages={(request.options?.messages ?? []).map(row => ({ code: row.code, label: row.description }))} selected={request.code}
              onSelect={request.setCode} disabled={busy} loading={request.loading} error={request.error} onRetry={request.reload} />}
          <AgreementNotice />
        </> : <>
          {preview ? <DigitalPreview key={preview.id} publicationId={resource.id} fileId={preview.id} name={preview.name} autoOpen />
            : <View style={detailUI.card}><Text style={detailUI.helper}>Este recurso no tiene archivos disponibles para previsualizar.</Text></View>}
          {resource.files.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{resource.files.map(file => <Pressable key={file.id}
            accessibilityRole="button" accessibilityLabel={`Previsualizar ${file.name}`} accessibilityState={{ selected: preview?.id === file.id }} onPress={() => setPreviewId(file.id)}
            style={[ui.chip, preview?.id === file.id && ui.activeChip]}><Text style={[ui.chipText, preview?.id === file.id && ui.activeChipText]}>{file.name}</Text></Pressable>)}</ScrollView>}
          <View style={{ gap: 12 }}><Text accessibilityRole="header" style={detailUI.title}>{resource.title}</Text><PriceTag modality={resource.modality} price={resource.price} />
            <View style={detailUI.inline}>{[...resource.careers.map(row => ({ ...row, key: 'career:' + row.id })), ...resource.subjects.map(row => ({ ...row, key: 'subject:' + row.id })), { key: 'campus', name: resource.campusName }].map(row => <StatusTag key={row.key} neutral>{row.name}</StatusTag>)}
              {acquired && <StatusTag>Ya lo tienes</StatusTag>}</View>
          </View>
          <DetailSection title="Descripción"><Text style={detailUI.body}>{resource.description}</Text></DetailSection>
          <DetailSection title={`Archivo${resource.files.length === 1 ? '' : 's'} del recurso`}>{resource.files.map(file => <View key={file.id} style={[detailUI.card, { flexDirection: 'row', alignItems: 'center' }]}>
            <FileText size={25} color={colors.primary} /><View style={{ flex: 1, gap: 4 }}><Text style={[detailUI.body, { fontWeight: '700' }]}>{file.name}</Text><Text style={detailUI.helper}>{file.mimeType === 'application/pdf' ? 'PDF' : file.mimeType} · {file.sizeBytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(file.sizeBytes / 1024))} KB` : `${(file.sizeBytes / 1024 / 1024).toLocaleString('es-CL', { maximumFractionDigits: 2 })} MB`}</Text>
              <View style={detailUI.inline}><LockKeyhole size={12} color={colors.secondary} /><Text style={detailUI.helper}>{library.isOwner ? 'Archivo original de tu publicación' : acquired ? 'Disponible en tus materiales adquiridos' : 'Se desbloquea al completar el acuerdo'}</Text></View>
            </View></View>)}</DetailSection>
          <OwnerCard owner={resource.owner} /><AgreementNotice />
          {request.error && <View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.error}>{request.error}</Text><Pressable accessibilityRole="button" disabled={busy || request.loading} onPress={request.reload} style={ui.outlined}><Text style={ui.link}>Consultar estado</Text></Pressable></View>}
          {library.isOwner && <Pressable accessibilityRole="button" disabled={busy} onPress={() => setManaging(true)} style={ui.outlined}><Text style={ui.link}>Administrar publicación</Text></Pressable>}
        </>}
    </ScrollView>
    {resource && !reporting && !managing && <DetailActionBar label={label} helper={helper} disabled={disabled} bottomOffset={safeAreaInset('bottom', insets.bottom, { min: 8, base: 98 })}
      onPress={acquired ? () => onAcquired(resource.id) : active ? onRequests : requesting ? () => { void request.submit().then(sent => { if (sent) void library.openDetail(resource.id); }); } : () => setRequesting(true)} />}
    <BottomNavigationBar activeItemId="elibrary" />
  </View>;
}
