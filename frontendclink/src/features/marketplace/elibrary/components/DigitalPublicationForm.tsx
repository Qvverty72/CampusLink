import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FileText, ShieldCheck, X } from 'lucide-react-native';
import type { useDigitalLibrary } from '../hooks/useDigitalLibrary';
import { DigitalAcademicSelector } from './DigitalAcademicSelector';
import { DigitalFileDropzone } from './DigitalFileDropzone';
import { CATALOG_COLORS as c } from '../../components/CatalogUI';
import { PublicationSection, PublicationModality, PublicationFeedback, PublicationSubmit, publicationUI as f } from '../../components/PublicationFormUI';

export function DigitalPublicationForm({ library }: { library: ReturnType<typeof useDigitalLibrary> }) {
  const disabled = library.busy || library.pickingFile, locked = disabled || Boolean(library.target);
  return <View style={f.form}>
    <Text style={f.hint}>{library.attachMode ? 'Añade material a tu publicación.' : library.target ? 'Tu recurso está guardado. Completa los archivos pendientes.' : 'Los campos con * son obligatorios.'}</Text>
    {!library.attachMode && <>
      <PublicationSection number="1" title="Datos del recurso">
        <View style={f.field}><Text style={f.label}>Nombre del recurso *</Text>
          <TextInput accessibilityLabel="Título" value={library.title} onChangeText={library.setTitle} maxLength={200} editable={!locked} placeholder="Ej. Guía de cálculo integral" style={f.input} /></View>
        <View style={f.field}><Text style={f.label}>Descripción *</Text>
          <TextInput accessibilityLabel="Descripción" value={library.description} onChangeText={library.setDescription} maxLength={4000} editable={!locked} placeholder="Qué incluye y cómo puede ayudar a otros estudiantes" multiline style={[f.input, f.textarea]} /></View>
      </PublicationSection>
      <PublicationSection number="2" title="Modalidad">
        <PublicationModality value={library.modality} onChange={library.setModality} disabled={locked} />
        {library.modality === 'VENTA' && <View style={f.field}><Text style={f.label}>Precio (CLP) *</Text>
          <TextInput accessibilityLabel="Precio (CLP)" value={library.price} onChangeText={library.setPrice} inputMode="decimal" maxLength={20} editable={!locked} placeholder="Ej. 2500" style={f.input} /></View>}
      </PublicationSection>
      <PublicationSection number="3" title="Clasificación académica">
        <DigitalAcademicSelector catalog={library.catalog} loading={library.catalogLoading} error={library.catalogError} reload={library.reloadCatalog}
          careerIds={library.careerIds} subjectIds={library.subjectIds} onCareersChange={library.setCareerIds} onSubjectsChange={library.setSubjectIds} disabled={locked} />
      </PublicationSection>
    </>}
    <PublicationSection number={library.attachMode ? '1' : '4'} title={library.attachMode ? 'Adjuntar archivos' : 'Archivos académicos *'} hint={library.attachMode ? library.target?.title : 'Agrega al menos un PDF para publicar.'}>
      <DigitalFileDropzone disabled={disabled} busy={library.pickingFile} onChoose={() => void library.chooseFile()} onDropFiles={files => void library.chooseFile(files)} />
      <Text style={f.hint}>Uno o varios PDF de hasta 25 MB cada uno. Se aceptan enlaces HTTPS, correos y teléfonos. Sin contraseña, JavaScript ni archivos adjuntos.</Text>
      {library.files.length > 0 && <Text style={f.label}>{library.files.length} archivo{library.files.length === 1 ? '' : 's'} pendiente{library.files.length === 1 ? '' : 's'} de cargar</Text>}
      {library.files.map((file, index) => <View key={`${file.uri}:${index}`} style={styles.file}>
        <FileText size={22} color={c.secondary} /><View style={styles.fileInfo}><Text style={styles.fileName}>{file.name}</Text>
          <Text style={f.hint}>PDF · {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB · Pendiente</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${file.name}`} disabled={disabled} onPress={() => library.removeFile(index)} style={styles.remove}>
          <X size={18} color={c.primary} /></Pressable>
      </View>)}
      {library.target && <Text style={f.notice}>{library.target.files.length} archivo{library.target.files.length === 1 ? '' : 's'} ya guardado{library.target.files.length === 1 ? '' : 's'}. Los datos publicados se conservan.</Text>}
      {Boolean(library.progress) && <Text style={f.notice} accessibilityLiveRegion="polite">{library.progress}</Text>}
      <View style={styles.privacy}><ShieldCheck size={18} color={c.secondary} /><Text style={[f.hint, styles.fileInfo]}>El original permanece privado. Solo tú y quienes adquieran el recurso podrán descargarlo.</Text></View>
    </PublicationSection>
    <PublicationFeedback error={library.error} notice={library.notice} />
    <PublicationSubmit label={library.busy ? 'Guardando archivos…' : library.target ? library.files.length ? 'Adjuntar archivos pendientes' : 'Actualizar publicación guardada' : 'Publicar recurso'}
      disabled={disabled || (!library.target && (!library.files.length || library.catalogLoading || Boolean(library.catalogError)))} busy={library.busy} onPress={() => void library.publish()} />
    <Pressable accessibilityRole="button" disabled={disabled} onPress={library.closeForm} style={f.secondary}><Text style={f.actionText}>{library.target ? 'Continuar con los archivos guardados' : 'Volver a la biblioteca'}</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: c.border, borderRadius: 12 },
  fileInfo: { flex: 1, minWidth: 0 }, fileName: { color: c.ink, fontWeight: '600', fontSize: 14, flexShrink: 1 },
  remove: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
});
