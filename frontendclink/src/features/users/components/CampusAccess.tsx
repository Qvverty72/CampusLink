import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { authStyles as styles } from '@/features/auth/components/form.styles';
import { accessLabels } from '../types/access';
import { useCampusAccess } from '../hooks/useCampusAccess';

/** Interfaz de administración de asignaciones y estados de cuenta por campus. */
export function CampusAccessScreen() {
  const { auth, campuses, campusId, setCampusId, page, setPage, users, hasMore, catalog, selected,
    roleIds, setRoleIds, permissionIds, setPermissionIds, loading, saving, accountAction, setAccountAction,
    error, notice, setNotice, selectUser, toggle, save, confirmAccountAction, retry, cancel } = useCampusAccess();
  const choices = (kind: 'roles' | 'permissions') => {
    const ids = kind === 'roles' ? roleIds : permissionIds;
    const setIds = kind === 'roles' ? setRoleIds : setPermissionIds;
    return <View style={local.card}>
      <Text style={styles.label}>{kind === 'roles' ? 'Roles' : 'Permisos independientes'}</Text>
      {catalog?.[kind].map(row => <View key={row.id} style={local.choice}>
        <Text style={[styles.description, local.choiceLabel]}>{accessLabels[row.nombre] ?? row.nombre}</Text>
        <Switch accessibilityLabel={accessLabels[row.nombre] ?? row.nombre} disabled={saving || Boolean(accountAction)} value={ids.includes(row.id)}
          onValueChange={() => setIds(toggle(ids, row.id))} trackColor={{ false: '#486476', true: '#0B6E75' }} />
      </View>)}
      {selected?.[kind].filter(row => !catalog?.[kind].some(item => item.id === row.catalog_id)).map(row =>
        <Text key={row.id} style={styles.description}>Asignación existente: {row.nombre} (se conserva)</Text>)}
    </View>;
  };
  return <ScrollView style={styles.page} contentContainerStyle={styles.container}>
    <Link href="/profile" style={styles.link}>← Volver a mi perfil</Link>
    <Text style={styles.brand}>ADMINISTRACIÓN</Text>
    <Text style={styles.title}>Usuarios y accesos</Text>
    <Text style={styles.description}>Administra cuentas, roles y permisos de cada campus a tu cargo.</Text>
    <Text style={styles.label}>Campus</Text>
    <View style={local.campuses}>{campuses.map(row => <Pressable key={row.id} accessibilityRole="button"
      accessibilityState={{ selected: row.id === campusId, disabled: saving }} disabled={saving}
      style={[local.campus, row.id === campusId && local.active]} onPress={() => { setPage(1); setCampusId(row.id); }}>
      <Text style={styles.description}>{row.name}</Text>
    </Pressable>)}</View>
    {loading && <ActivityIndicator accessibilityLabel="Cargando accesos" color="#74C69D" />}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!notice && <Text accessibilityRole="alert" style={styles.link}>{notice}</Text>}
    {!!error && !saving && <Pressable accessibilityRole="button" style={styles.button} onPress={retry}><Text style={styles.buttonText}>Reintentar / recargar</Text></Pressable>}
    {!loading && !error && !campuses.length && <Text style={styles.description}>No tienes campus activos para administrar.</Text>}
    {!selected && !loading && catalog && <>
      <Text style={styles.label}>Usuarios del campus</Text>
      {!users.length && <Text style={styles.description}>No hay usuarios en esta página.</Text>}
      {users.map(user => <Pressable key={user.userId} accessibilityRole="button" style={local.card} onPress={() => void selectUser(user.userId)}>
        <Text style={styles.label}>{user.fullName}</Text><Text style={styles.description}>{user.accountState}</Text>
      </Pressable>)}
      <View style={local.choice}>
        <Pressable accessibilityRole="button" disabled={page === 1} onPress={() => setPage(value => value - 1)}><Text style={[styles.link, page === 1 && styles.disabled]}>Anterior</Text></Pressable>
        <Text style={styles.description}>Página {page}</Text>
        <Pressable accessibilityRole="button" disabled={!hasMore} onPress={() => setPage(value => value + 1)}><Text style={[styles.link, !hasMore && styles.disabled]}>Siguiente</Text></Pressable>
      </View>
    </>}
    {selected && <>
      <Text style={styles.label}>{selected.fullName} · {selected.accountState}</Text>
      <Text style={styles.description}>Los permisos especiales requieren el rol Usuario autorizado. Administrador tiene todas las funciones en esta sede. Sin roles especiales, una cuenta institucional verificada conserva sus funciones generales.</Text>
      {choices('roles')}{choices('permissions')}
      <Pressable accessibilityRole="button" disabled={saving || Boolean(error) || Boolean(accountAction)} style={[styles.button, (saving || Boolean(error) || Boolean(accountAction)) && styles.disabled]} onPress={() => void save()}>
        <Text style={styles.buttonText}>{saving ? 'Guardando…' : 'Guardar accesos'}</Text>
      </Pressable>
      <View style={local.card}>
        <Text style={styles.label}>Estado de la cuenta</Text>
        {accountAction ? <>
          <Text style={styles.label}>{accountAction === 'SUSPENDIDA' ? '¿Suspender' : '¿Desactivar'} a {selected.fullName}?</Text>
          <Text style={styles.description}>{accountAction === 'SUSPENDIDA'
            ? 'La cuenta perderá acceso a las operaciones protegidas, incluso con una sesión iniciada.'
            : 'La cuenta perderá acceso y se retirarán sus publicaciones físicas activas de todas las sedes. Se conservarán su historial y los recursos digitales adquiridos por otras personas.'}</Text>
          <Text style={styles.description}>Los roles y permisos se conservarán.</Text>
          {selected.userId === auth.identity?.userId && <Text style={styles.error}>Estás actuando sobre tu propia cuenta y perderás tu acceso.</Text>}
          <Pressable accessibilityRole="button" disabled={saving} style={[styles.button, saving && styles.disabled]} onPress={() => void confirmAccountAction()}>
            <Text style={styles.buttonText}>{saving ? 'Aplicando…' : accountAction === 'SUSPENDIDA' ? 'Confirmar suspensión' : 'Confirmar desactivación'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => setAccountAction(null)}><Text style={styles.link}>Cancelar acción</Text></Pressable>
        </> : <>
          {selected.accountState === 'ACTIVA' && <Pressable accessibilityRole="button" disabled={saving || Boolean(error)} style={[styles.button, (saving || Boolean(error)) && styles.disabled]}
            onPress={() => { setNotice(''); setAccountAction('SUSPENDIDA'); }}><Text style={styles.buttonText}>Suspender cuenta</Text></Pressable>}
          {selected.accountState !== 'DESACTIVADA' && <Pressable accessibilityRole="button" disabled={saving || Boolean(error)} style={[styles.button, (saving || Boolean(error)) && styles.disabled]}
            onPress={() => { setNotice(''); setAccountAction('DESACTIVADA'); }}><Text style={styles.buttonText}>Desactivar cuenta</Text></Pressable>}
          {selected.accountState === 'DESACTIVADA' && <Text style={styles.description}>Esta cuenta está desactivada.</Text>}
        </>}
      </View>
      <Pressable accessibilityRole="button" disabled={saving} onPress={cancel}>
        <Text style={styles.link}>Cancelar / volver al listado</Text>
      </Pressable>
    </>}
  </ScrollView>;
}

const local = StyleSheet.create({
  card: { backgroundColor: '#102A3F', padding: 16, borderRadius: 14, gap: 8 },
  campuses: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  campus: { borderWidth: 1, borderColor: '#486476', borderRadius: 12, padding: 12 },
  active: { borderColor: '#74C69D', backgroundColor: '#102A3F' },
  choice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  choiceLabel: { flex: 1 },
});
