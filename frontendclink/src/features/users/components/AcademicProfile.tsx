import { Circle, CircleCheck, Square, SquareCheck } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { APP_COLORS } from '@/types/colors';
import { useAcademicProfile } from '../hooks/useAcademicProfile';

export function AcademicProfileSection() {
  const { profile, options, editing, setEditing, fullName, setFullName, campusId, setCampusId,
    careerIds, setCareerIds, busy, error, setError, conflict, setRevision, save, offered, selectionsValid } = useAcademicProfile();

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>Perfil académico</Text>
        {profile && !editing && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Editar perfil académico"
            accessibilityState={{ disabled: busy || !options }}
            disabled={busy || !options}
            onPress={() => setEditing(true)}
            activeOpacity={0.65}
            style={[styles.editButton, (busy || !options) && styles.disabled]}
          >
            <Text style={styles.actionText}>Editar</Text>
          </TouchableOpacity>
        )}
      </View>

      {busy && <ActivityIndicator color={APP_COLORS.ACCENT} accessibilityLabel={editing ? 'Guardando perfil académico' : 'Cargando perfil académico'} />}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {(!profile || conflict) && !busy && (
        <TouchableOpacity accessibilityRole="button" activeOpacity={0.65} style={styles.textButton} onPress={() => setRevision(value => value + 1)}>
          <Text style={styles.actionText}>Recargar perfil</Text>
        </TouchableOpacity>
      )}

      {profile && !editing && (
        <View style={styles.details}>
          <View style={styles.campus}>
            <Text style={styles.label}>Campus</Text>
            <Text style={styles.value}>{profile.campusName || 'Sin campus disponible'}</Text>
          </View>
          <View style={styles.careers}>
            <Text style={styles.label}>{profile.careers.length === 1 ? 'Carrera' : 'Carreras'}</Text>
            {profile.careers.length ? profile.careers.map(row => (
              <Text key={row.id} style={styles.value}>{row.nombre}</Text>
            )) : <Text style={styles.value}>Sin carreras asociadas</Text>}
          </View>
        </View>
      )}

      {editing && options && <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Nombre completo</Text>
          <TextInput accessibilityLabel="Nombre completo" value={fullName} onChangeText={setFullName} editable={!busy} maxLength={200} autoComplete="name" autoCapitalize="words" style={styles.input} />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Campus</Text>
          {!options.campuses.some(row => row.id === campusId) && (
            <Text style={styles.error}>{options.campuses.length ? 'Selecciona un campus disponible para guardar.' : 'No hay campus disponibles para editar el perfil.'}</Text>
          )}
          {options.campuses.map(row => (
            <TouchableOpacity
              key={row.id}
              accessibilityRole="radio"
              accessibilityLabel={row.name}
              accessibilityState={{ checked: campusId === row.id, disabled: busy }}
              disabled={busy}
              activeOpacity={0.65}
              style={[styles.choice, campusId === row.id && styles.selectedChoice, busy && styles.disabled]}
              onPress={() => {
                setCampusId(row.id);
                setCareerIds(ids => ids.filter(id => options.careers.some(career => career.id === id && career.campusIds.includes(row.id))));
              }}
            >
              <SelectionIcon selected={campusId === row.id} />
              <Text style={styles.choiceText}>{row.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Carreras</Text>
          <Text style={styles.help}>Puedes elegir varias carreras de tu campus.</Text>
          {!offered.length && <Text style={styles.help}>No hay carreras disponibles en este campus.</Text>}
          {offered.map(row => (
            <TouchableOpacity
              key={row.id}
              accessibilityRole="checkbox"
              accessibilityLabel={row.name}
              accessibilityState={{ checked: careerIds.includes(row.id), disabled: busy }}
              disabled={busy}
              activeOpacity={0.65}
              style={[styles.choice, careerIds.includes(row.id) && styles.selectedChoice, busy && styles.disabled]}
              onPress={() => setCareerIds(ids => ids.includes(row.id) ? ids.filter(id => id !== row.id) : [...ids, row.id])}
            >
              <SelectionIcon selected={careerIds.includes(row.id)} multiple />
              <Text style={styles.choiceText}>{row.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {careerIds.some(id => !offered.some(row => row.id === id)) && <>
          <Text style={styles.error}>Hay carreras anteriores que ya no están disponibles en este campus.</Text>
          <TouchableOpacity accessibilityRole="button" activeOpacity={0.65} disabled={busy} style={styles.textButton} onPress={() => setCareerIds(ids => ids.filter(id => offered.some(row => row.id === id)))}>
            <Text style={styles.actionText}>Retirar carreras no disponibles</Text>
          </TouchableOpacity>
        </>}
        <Text style={styles.help}>Al cambiar de campus se retiran de la selección las carreras que no se ofrecen allí. Se recalculan tus permisos; tus publicaciones conservan su sede original.</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || conflict || !selectionsValid, busy }}
          disabled={busy || conflict || !selectionsValid}
          activeOpacity={0.65}
          style={[styles.saveButton, (busy || conflict || !selectionsValid) && styles.disabled]}
          onPress={() => void save()}
        >
          <Text style={styles.saveText}>{busy ? 'Guardando…' : 'Guardar cambios'}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" activeOpacity={0.65} disabled={busy} style={styles.textButton} onPress={() => {
          setEditing(false); setError(null); setFullName(profile!.fullName);
          setCampusId(profile!.campusId); setCareerIds(profile!.careers.map(row => row.id));
        }}>
          <Text style={styles.actionText}>Cancelar</Text>
        </TouchableOpacity>
      </View>}
    </View>
  );
}

function SelectionIcon({ selected, multiple = false }: { selected: boolean; multiple?: boolean }) {
  const Icon = multiple ? (selected ? SquareCheck : Square) : (selected ? CircleCheck : Circle);
  return (
    <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icon size={18} color={selected ? APP_COLORS.ACCENT : '#FFFFFFB8'} strokeWidth={1.7} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: `${APP_COLORS.SECONDARY}66`, padding: 16, borderRadius: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  editButton: { minHeight: 44, minWidth: 44, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginVertical: -10 },
  actionText: { color: APP_COLORS.ACCENT, fontSize: 13, fontWeight: '600', lineHeight: 20 },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  campus: { flexGrow: 1, flexBasis: 84, gap: 3 },
  careers: { flexGrow: 2, flexBasis: 120, gap: 3 },
  label: { color: '#FFFFFFB8', fontSize: 11, lineHeight: 16 },
  value: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', lineHeight: 19 },
  form: { gap: 18 },
  field: { gap: 8 },
  fieldLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', lineHeight: 20 },
  help: { color: '#FFFFFFB8', fontSize: 12, lineHeight: 19 },
  input: { color: '#FFFFFF', backgroundColor: '#FFFFFF08', borderColor: '#FFFFFF40', borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 48 },
  choice: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#FFFFFF26', borderRadius: 10 },
  selectedChoice: { borderColor: `${APP_COLORS.ACCENT}99`, backgroundColor: `${APP_COLORS.ACCENT}0D` },
  choiceText: { flex: 1, color: '#FFFFFF', fontSize: 13, lineHeight: 20 },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 10 },
  saveButton: { minHeight: 48, backgroundColor: APP_COLORS.ACCENT, padding: 14, borderRadius: 12, alignItems: 'center' },
  saveText: { color: APP_COLORS.PRIMARY, fontSize: 14, fontWeight: '700' },
  error: { color: '#FFB4AB', fontSize: 13, lineHeight: 20 },
  disabled: { opacity: 0.5 },
});
