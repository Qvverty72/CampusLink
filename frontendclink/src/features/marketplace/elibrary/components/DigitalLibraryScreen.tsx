import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useRef } from 'react';
import { BookOpen, FileText, Plus } from 'lucide-react-native';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { APP_COLORS } from '@/types/colors';
import { useDigitalLibrary } from '../hooks/useDigitalLibrary';
import type { DigitalPublication } from '../types/publication';

const terms = (item: DigitalPublication) => item.modality === 'DONACION' ? 'Donación' : `$${item.price?.toLocaleString('es-CL')} CLP`;
export default function DigitalLibraryScreen() {
  const auth = useAuth();
  return <Library key={`${auth.identity?.userId}:${auth.identity?.campusId}:${auth.session?.access_token}`} />;
}
function Library() {
  const library = useDigitalLibrary();
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [library.error, library.notice, library.formOpen, library.detail?.id]);
  const disabled = library.busy || library.pickingFile;
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.heading}><BookOpen size={25} color={APP_COLORS.PRIMARY} /><Text style={styles.brand}>CAMPUSLINK</Text></View>
      <Text style={styles.title}>Biblioteca digital</Text>
      <Text style={styles.subtitle}>Comparte conocimiento con estudiantes de todos los campus de tu institución.</Text>
      {library.error && <View style={styles.errorBox} accessibilityLiveRegion="assertive"><Text style={styles.error}>{library.error}</Text>
        {!library.busy && <Pressable accessibilityRole="button" onPress={library.reload} style={styles.smallButton}><Text style={styles.link}>Actualizar biblioteca</Text></Pressable>}
      </View>}
      {library.notice && <Text style={styles.notice} accessibilityLiveRegion="polite">{library.notice}</Text>}
      {library.formOpen ? <View style={styles.card}>
        <Text style={styles.sectionTitle}>{library.attachMode ? 'Adjuntar archivos' : library.target ? 'Completar archivos pendientes' : 'Publicar un recurso'}</Text>
        {library.attachMode ? <Text style={styles.body}>{library.target?.title}</Text> : <>
        <Text style={styles.label}>Título</Text>
        <TextInput accessibilityLabel="Título" value={library.title} onChangeText={library.setTitle} maxLength={200} editable={!disabled && !library.target}
          placeholder="Ej. Apuntes de cálculo integral" placeholderTextColor="#758594" style={styles.input} />
        <Text style={styles.label}>Descripción</Text>
        <TextInput accessibilityLabel="Descripción" value={library.description} onChangeText={library.setDescription} maxLength={4000} editable={!disabled && !library.target}
          placeholder="Explica el contenido y para qué puede servir" placeholderTextColor="#758594" multiline style={[styles.input, styles.textarea]} />
        <Text style={styles.label}>Modalidad</Text>
        <View style={styles.row}>{(['DONACION', 'VENTA'] as const).map(mode => <Pressable key={mode} accessibilityRole="radio"
          accessibilityLabel={mode === 'DONACION' ? 'Donación' : 'Venta'} accessibilityState={{ checked: library.modality === mode, disabled: disabled || Boolean(library.target) }} disabled={disabled || Boolean(library.target)}
          onPress={() => library.setModality(mode)} style={[styles.choice, library.modality === mode && styles.selected]}>
          <Text style={[styles.choiceText, library.modality === mode && styles.selectedText]}>{mode === 'DONACION' ? 'Donación' : 'Venta'}</Text>
        </Pressable>)}</View>
        {library.modality === 'VENTA' && <><Text style={styles.label}>Precio (CLP)</Text>
          <TextInput accessibilityLabel="Precio (CLP)" value={library.price} onChangeText={library.setPrice} keyboardType="decimal-pad" maxLength={20}
            editable={!disabled && !library.target} placeholder="Ej. 2500" placeholderTextColor="#758594" style={styles.input} /></>}
        </>}
        <Text style={styles.label}>Archivos académicos</Text>
        <Text style={styles.helper}>Uno o varios PDF de hasta 25 MB cada uno, sin contraseña, acciones ni archivos adjuntos.</Text>
        <Pressable accessibilityRole="button" disabled={disabled} onPress={library.chooseFile} style={[styles.fileButton, disabled && styles.disabled]}>
          <FileText size={22} color={APP_COLORS.PRIMARY} /><Text style={styles.fileText}>{library.pickingFile ? 'Abriendo selector…' : 'Seleccionar archivos PDF'}</Text>
        </Pressable>
        {library.files.map((file, index) => <View key={`${file.uri}:${index}`} style={styles.row}>
          <View style={styles.fileInfo}><Text style={styles.fileText}>{file.name}</Text><Text style={styles.helper}>{(file.sizeBytes / 1024 / 1024).toFixed(2)} MB</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${file.name}`} disabled={disabled} onPress={() => library.removeFile(index)} style={styles.smallButton}><Text style={styles.link}>Quitar</Text></Pressable>
        </View>)}
        {library.progress && <Text style={styles.helper} accessibilityLiveRegion="polite">{library.progress}</Text>}
        <Text style={styles.helper}>La publicación mostrará los datos del recurso. El archivo original se mantiene privado.</Text>
        <Pressable accessibilityRole="button" disabled={disabled} onPress={library.publish} style={[styles.primary, disabled && styles.disabled]}>
          {library.busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{library.target ? 'Adjuntar archivos pendientes' : 'Publicar recurso'}</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={disabled} onPress={library.closeForm} style={styles.smallButton}><Text style={styles.link}>{library.target ? 'Continuar con los archivos guardados' : 'Volver a la biblioteca'}</Text></Pressable>
      </View> : library.detail ? <View style={styles.card}>
        <Text style={styles.badge}>DISPONIBLE · {terms(library.detail)}</Text>
        <Text style={styles.sectionTitle}>{library.detail.title}</Text>
        <Text style={styles.body}>{library.detail.description}</Text>
        <Text style={styles.helper}>Campus de origen: {library.detail.campusName}</Text>
        {library.detail.files.map(file => <View key={file.id} style={styles.fileButton}><FileText color={APP_COLORS.PRIMARY} size={22} />
          <View style={styles.fileInfo}><Text style={styles.fileText}>{file.name}</Text><Text style={styles.helper}>PDF · {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB</Text></View>
          {library.isOwner && <Pressable accessibilityRole="button" accessibilityLabel={`Descargar ${file.name}`} disabled={Boolean(library.downloading)} onPress={() => library.download(file)} style={styles.smallButton}>
            {library.downloading === file.id ? <ActivityIndicator /> : <Text style={styles.link}>Descargar</Text>}
          </Pressable>}
        </View>)}
        {library.isOwner ? <Pressable accessibilityRole="button" disabled={Boolean(library.downloading)} onPress={library.openAttachments} style={styles.primary}><Plus size={20} color="#FFFFFF" /><Text style={styles.primaryText}>Añadir archivos</Text></Pressable>
          : <Text style={styles.helper}>Archivos privados. La adquisición estará disponible en una próxima etapa.</Text>}
        <Pressable accessibilityRole="button" onPress={library.closeDetail} style={styles.smallButton}><Text style={styles.link}>Volver a la biblioteca</Text></Pressable>
      </View> : <>
        <Pressable accessibilityRole="button" onPress={library.openForm} style={styles.primary}><Plus color="#FFFFFF" size={20} /><Text style={styles.primaryText}>Publicar recurso</Text></Pressable>
        <View style={styles.listHeading}><Text style={styles.sectionTitle}>Publicaciones recientes</Text>
          <Pressable accessibilityRole="button" onPress={library.reload} style={styles.smallButton}><Text style={styles.link}>Actualizar</Text></Pressable>
        </View>
        {library.loading ? <ActivityIndicator accessibilityLabel="Cargando publicaciones" color={APP_COLORS.PRIMARY} /> : library.items.length ? library.items.map(item =>
          <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Consultar ${item.title}`} onPress={() => library.openDetail(item.id)} style={styles.card}>
            <Text style={styles.badge}>{terms(item)}</Text><Text style={styles.itemTitle}>{item.title}</Text>
            <Text numberOfLines={2} style={styles.body}>{item.description}</Text><Text style={styles.helper}>{item.campusName} · {item.files.length} archivo{item.files.length === 1 ? '' : 's'}</Text>
            <Text style={styles.link}>Consultar recurso</Text>
          </Pressable>) : <View style={styles.card}><FileText color="#607485" size={30} /><Text style={styles.sectionTitle}>El conocimiento empieza contigo</Text>
            <Text style={styles.body}>Aún no hay publicaciones disponibles. Comparte tu primer material académico.</Text></View>}
      </>}
    </ScrollView>
    <BottomNavigationBar activeItemId="elibrary" />
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F7F9' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 48, paddingBottom: 140, gap: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { color: APP_COLORS.PRIMARY, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#09243A', fontSize: 32, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { color: '#607485', fontSize: 16, lineHeight: 24 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#E0E8ED', padding: 22, gap: 14 },
  sectionTitle: { color: '#09243A', fontSize: 21, fontWeight: '700' },
  itemTitle: { color: '#09243A', fontSize: 19, fontWeight: '700' },
  body: { color: '#40596C', fontSize: 16, lineHeight: 24 },
  helper: { color: '#607485', fontSize: 14, lineHeight: 21 },
  label: { color: '#09243A', fontSize: 15, fontWeight: '600', marginTop: 4 },
  input: { borderColor: '#BDCBD5', borderWidth: 1, borderRadius: 12, padding: 14, minHeight: 50, fontSize: 16, color: '#09243A', backgroundColor: '#FCFDFE' },
  textarea: { minHeight: 120, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  choice: { flex: 1, borderWidth: 1, borderColor: '#BDCBD5', padding: 14, borderRadius: 12, alignItems: 'center' },
  selected: { borderColor: APP_COLORS.PRIMARY, backgroundColor: '#E9F0F6' },
  choiceText: { color: '#607485', fontSize: 16 },
  selectedText: { color: APP_COLORS.PRIMARY, fontWeight: '700' },
  primary: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: APP_COLORS.PRIMARY, borderRadius: 14, padding: 17, minHeight: 54 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  fileButton: { flexDirection: 'row', gap: 12, alignItems: 'center', borderColor: '#BDCBD5', borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 16, minHeight: 58 },
  fileText: { color: APP_COLORS.PRIMARY, fontSize: 15, flexShrink: 1 },
  fileInfo: { flex: 1, gap: 4 },
  smallButton: { paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  link: { color: APP_COLORS.PRIMARY, fontSize: 15, fontWeight: '600' },
  badge: { color: '#0B6E75', fontSize: 13, fontWeight: '700' },
  listHeading: { gap: 4, marginTop: 8 },
  notice: { color: '#17613F', backgroundColor: '#E5F3EB', padding: 16, borderRadius: 12, fontSize: 15, lineHeight: 23 },
  errorBox: { backgroundColor: '#FFF0EE', padding: 16, borderRadius: 12 },
  error: { color: '#9D302A', fontSize: 15, lineHeight: 23 },
  disabled: { opacity: 0.5 },
});
