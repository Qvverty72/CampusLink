import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { authStyles as styles } from '@/features/auth/form.styles';
import { accessLabels, loadAccessCampuses, loadAccessCatalog, loadAccessUsers, loadUserAccess, saveUserAccess,
  type AccessCatalog, type AccessUser, type UserAccess } from './access';

export function CampusAccessScreen() {
  const auth = useAuth();
  const [campuses, setCampuses] = useState<{ id: string; name: string }[]>([]);
  const [campusId, setCampusId] = useState('');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [catalog, setCatalog] = useState<AccessCatalog | null>(null);
  const [selected, setSelected] = useState<UserAccess | null>(null);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [permissionIds, setPermissionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const pending = useRef<AbortController | null>(null);
  const selectedId = useRef<string | null>(null);
  function fail(reason: unknown) {
    setError(reason instanceof AuthApiError && reason.status === 409 ? 'Los accesos cambiaron. Recarga el usuario antes de guardar.'
      : reason instanceof AuthApiError && reason.status === 403 ? 'Tu acceso a este campus ya no está disponible.'
      : reason instanceof AuthApiError && reason.status === 404 ? 'El usuario ya no está disponible en este campus.'
      : reason instanceof AuthApiError && reason.status === 400 ? 'Revisa los roles y permisos seleccionados.'
      : reason instanceof AuthApiError && reason.status === 401 ? 'Tu sesión venció. Inicia sesión nuevamente.'
      : 'No se pudieron cargar o guardar los accesos. Inténtalo nuevamente.');
    if (reason instanceof AuthApiError && [401,403].includes(reason.status)) auth.refreshIdentity();
    if (reason instanceof AuthApiError && reason.status === 404) { setSelected(null); selectedId.current = null; }
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void loadAccessCampuses(controller.signal).then(rows => {
      if (controller.signal.aborted) return;
      setCampuses(rows); setCampusId(current => rows.some(row => row.id === current) ? current : rows[0]?.id ?? '');
      setLoading(false);
    }).catch(reason => { if (!controller.signal.aborted) { fail(reason); setLoading(false); } });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    if (!campusId) return;
    const controller = new AbortController();
    pending.current?.abort(); pending.current = controller;
    setLoading(true); setError(''); setSelected(null); selectedId.current = null; setCatalog(null); setUsers([]); setNotice('');
    void Promise.all([loadAccessCatalog(campusId, controller.signal), loadAccessUsers(campusId, page, controller.signal)])
      .then(([options, result]) => {
        if (controller.signal.aborted) return;
        setCatalog(options); setUsers(result.data); setHasMore(result.meta.hasMore); setLoading(false);
      }).catch(reason => { if (!controller.signal.aborted) { fail(reason); setLoading(false); } });
    return () => controller.abort();
  }, [campusId, page, reload]);
  useEffect(() => () => { pending.current?.abort(); }, []);
  const selectUser = async (userId: string) => {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    selectedId.current = userId; setSelected(null); setError(''); setNotice(''); setLoading(true);
    try {
      const detail = await loadUserAccess(campusId, userId, controller.signal);
      if (controller.signal.aborted) return;
      setSelected(detail); setRoleIds(detail.roles.map(row => row.catalog_id)); setPermissionIds(detail.permissions.map(row => row.catalog_id));
    } catch (reason) { if (!controller.signal.aborted) fail(reason); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  };
  const toggle = (ids: string[], id: string) => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
  const save = async () => {
    if (!selected || saving) return;
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    setSaving(true); setError(''); setNotice('');
    try {
      const detail = await saveUserAccess(campusId, selected.userId, { roleIds, permissionIds, version: selected.version }, controller.signal);
      if (controller.signal.aborted) return;
      setSelected(detail); setNotice('Accesos guardados. Se aplicarán en las próximas operaciones del usuario.');
      if (selected.userId === auth.identity?.userId) auth.refreshIdentity();
    } catch (reason) { if (!controller.signal.aborted) fail(reason); }
    finally { if (!controller.signal.aborted) setSaving(false); }
  };
  const choices = (kind: 'roles' | 'permissions') => {
    const ids = kind === 'roles' ? roleIds : permissionIds;
    const setIds = kind === 'roles' ? setRoleIds : setPermissionIds;
    return <View style={local.card}>
      <Text style={styles.label}>{kind === 'roles' ? 'Roles' : 'Permisos independientes'}</Text>
      {catalog?.[kind].map(row => <View key={row.id} style={local.choice}>
        <Text style={[styles.description, local.choiceLabel]}>{accessLabels[row.nombre] ?? row.nombre}</Text>
        <Switch accessibilityLabel={accessLabels[row.nombre] ?? row.nombre} disabled={saving} value={ids.includes(row.id)}
          onValueChange={() => setIds(toggle(ids, row.id))} trackColor={{ false: '#486476', true: '#0B6E75' }} />
      </View>)}
      {selected?.[kind].filter(row => !catalog?.[kind].some(item => item.id === row.catalog_id)).map(row =>
        <Text key={row.id} style={styles.description}>Asignación existente: {row.nombre} (se conserva)</Text>)}
    </View>;
  };
  return <ScrollView style={styles.page} contentContainerStyle={styles.container}>
    <Link href="/profile" style={styles.link}>← Volver a mi perfil</Link>
    <Text style={styles.brand}>ADMINISTRACIÓN</Text>
    <Text style={styles.title}>Roles y permisos</Text>
    <Text style={styles.description}>Administra los accesos de los usuarios de cada campus a tu cargo.</Text>
    <Text style={styles.label}>Campus</Text>
    <View style={local.campuses}>{campuses.map(row => <Pressable key={row.id} accessibilityRole="button"
      accessibilityState={{ selected: row.id === campusId, disabled: saving }} disabled={saving}
      style={[local.campus, row.id === campusId && local.active]} onPress={() => { setPage(1); setCampusId(row.id); }}>
      <Text style={styles.description}>{row.name}</Text>
    </Pressable>)}</View>
    {loading && <ActivityIndicator accessibilityLabel="Cargando accesos" color="#74C69D" />}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {notice && <Text accessibilityRole="alert" style={styles.link}>{notice}</Text>}
    {error && !saving && <Pressable accessibilityRole="button" style={styles.button} onPress={() => {
      if (selectedId.current && campusId) void selectUser(selectedId.current); else setReload(value => value + 1);
    }}><Text style={styles.buttonText}>Reintentar / recargar</Text></Pressable>}
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
      <Pressable accessibilityRole="button" disabled={saving || Boolean(error)} style={[styles.button, (saving || Boolean(error)) && styles.disabled]} onPress={() => void save()}>
        <Text style={styles.buttonText}>{saving ? 'Guardando…' : 'Guardar accesos'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => { setSelected(null); selectedId.current = null; setError(''); setNotice(''); }}>
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
