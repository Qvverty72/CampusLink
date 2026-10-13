import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAcademicProfile } from '../hooks/useAcademicProfile';

export function AcademicProfileSection() {
  const { profile, options, editing, setEditing, fullName, setFullName, campusId, setCampusId,
    careerIds, setCareerIds, busy, error, setError, conflict, setRevision, save, offered, selectionsValid } = useAcademicProfile();
  return <View style={styles.card}>
    <Text style={styles.title}>Perfil académico</Text>
    {busy && <ActivityIndicator accessibilityLabel="Cargando perfil académico" />}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {(!profile || conflict) && !busy && <Pressable accessibilityRole="button" onPress={() => setRevision(value => value + 1)}><Text style={styles.action}>Recargar perfil</Text></Pressable>}
    {profile && !editing && <>
      <Text style={styles.text}>Campus: {profile.campusName || 'Sin campus disponible'}</Text>
      <Text style={styles.text}>Carreras: {profile.careers.map(row => row.nombre).join(' · ') || 'Sin carreras asociadas'}</Text>
      <Pressable accessibilityRole="button" disabled={busy || !options} onPress={() => setEditing(true)}><Text style={styles.action}>Editar perfil académico</Text></Pressable>
    </>}
    {editing && options && <>
      <Text style={styles.text}>Nombre completo</Text>
      <TextInput accessibilityLabel="Nombre completo" value={fullName} onChangeText={setFullName} editable={!busy} maxLength={200} autoComplete="name" style={styles.input} />
      <Text style={styles.text}>Campus</Text>
      {!options.campuses.some(row => row.id === campusId) && <Text style={styles.error}>{options.campuses.length ? 'Selecciona un campus disponible para guardar.' : 'No hay campus disponibles para editar el perfil.'}</Text>}
      {options.campuses.map(row => <Pressable key={row.id} accessibilityRole="radio" accessibilityState={{ checked: campusId === row.id, disabled: busy }} disabled={busy}
        onPress={() => { setCampusId(row.id); setCareerIds(ids => ids.filter(id => options.careers.some(career => career.id === id && career.campusIds.includes(row.id)))); }}>
        <Text style={styles.choice}>{campusId === row.id ? '●' : '○'} {row.name}</Text>
      </Pressable>)}
      <Text style={styles.text}>Carreras ofrecidas en este campus (puedes elegir varias)</Text>
      {!offered.length && <Text style={styles.text}>No hay carreras disponibles en este campus.</Text>}
      {offered.map(row => <Pressable key={row.id} accessibilityRole="checkbox" accessibilityState={{ checked: careerIds.includes(row.id), disabled: busy }} disabled={busy}
        onPress={() => setCareerIds(ids => ids.includes(row.id) ? ids.filter(id => id !== row.id) : [...ids, row.id])}>
        <Text style={styles.choice}>{careerIds.includes(row.id) ? '☑' : '☐'} {row.name}</Text>
      </Pressable>)}
      {careerIds.some(id => !offered.some(row => row.id === id)) && <>
        <Text style={styles.error}>Hay carreras anteriores que ya no están disponibles en este campus.</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setCareerIds(ids => ids.filter(id => offered.some(row => row.id === id)))}><Text style={styles.action}>Retirar carreras no disponibles</Text></Pressable>
      </>}
      <Text style={styles.text}>Al cambiar de campus se retiran de la selección las carreras que no se ofrecen allí. Se recalculan tus permisos; tus publicaciones conservan su sede original.</Text>
      <Pressable accessibilityRole="button" disabled={busy || conflict || !selectionsValid} style={[styles.button, (busy || conflict || !selectionsValid) && styles.disabled]} onPress={() => void save()}><Text style={styles.buttonText}>{busy ? 'Guardando…' : 'Guardar cambios'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setEditing(false); setError(null); setFullName(profile!.fullName); setCampusId(profile!.campusId); setCareerIds(profile!.careers.map(row => row.id)); }}><Text style={styles.action}>Cancelar</Text></Pressable>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#102A3F', padding: 18, borderRadius: 16, marginTop: 16, gap: 12 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  text: { color: '#B9CAD6', fontSize: 15, lineHeight: 23 },
  choice: { color: '#FFFFFF', fontSize: 16, paddingVertical: 10 },
  action: { color: '#74C69D', fontSize: 16, paddingVertical: 10 },
  error: { color: '#FFB4AB', fontSize: 15, lineHeight: 23 },
  input: { color: '#FFFFFF', borderColor: '#486476', borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16 },
  button: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#09243A', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
