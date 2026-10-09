import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { authStyles as styles } from '@/features/auth/form.styles';
import { accessLabels, loadAccessCampuses } from './access';
import { auditLabels, loadAuditEntries, loadAuditEntry, type AuditEntry, type AuditDetail } from './audit';

function Snapshot({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  const display = (item: unknown) => item === null ? 'Sin valor' : accessLabels[String(item)] ?? auditLabels[String(item)] ?? String(item);
  return <View style={local.card}>
    <Text style={styles.label}>{title}</Text>
    {!value || !Object.keys(value).length ? <Text style={styles.description}>Sin datos históricos disponibles.</Text>
      : Object.entries(value).map(([key,item]) => <View key={key} style={local.field}>
        <Text style={styles.label}>{auditLabels[key] ?? key}</Text>
        {Array.isArray(item) ? item.length ? item.map((row,index) => <View key={index} style={local.assignment}>
          {Object.entries(row as Record<string,unknown>).map(([name,content]) =>
            <Text selectable key={name} style={styles.description}>{auditLabels[name] ?? name}: {display(content)}</Text>)}
        </View>) : <Text style={styles.description}>Sin asignaciones o registros.</Text>
          : <Text selectable style={styles.description}>{display(item)}</Text>}
      </View>)}
  </View>;
}

export function AuditHistoryScreen() {
  const auth = useAuth();
  const [campuses,setCampuses] = useState<{ id: string; name: string }[]>([]);
  const [campusId,setCampusId] = useState('');
  const [page,setPage] = useState(1);
  const [entries,setEntries] = useState<AuditEntry[]>([]);
  const [hasMore,setHasMore] = useState(false);
  const [selected,setSelected] = useState<AuditDetail | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [reload,setReload] = useState(0);
  const pending = useRef<AbortController | null>(null);
  const loadedIdentity = useRef<string | null>(null);
  const date = (value: string) => new Date(value).toLocaleString();
  function fail(reason: unknown) {
    setError(reason instanceof AuthApiError && reason.status === 403 ? 'Tu acceso a este campus ya no está disponible.'
      : reason instanceof AuthApiError && reason.status === 401 ? 'Tu sesión venció. Inicia sesión nuevamente.'
      : reason instanceof AuthApiError && reason.status === 404 ? 'El registro no está disponible en este campus.'
      : 'No se pudo consultar el historial. Inténtalo nuevamente.');
    if (reason instanceof AuthApiError && [401,403].includes(reason.status)) {
      setEntries([]); setSelected(null); setHasMore(false); void auth.refreshIdentity();
    }
  }
  // Context changes cancel requests and erase the previous actor's history immediately.
  const identityKey = auth.identity ? JSON.stringify([auth.identity.userId,auth.identity.campusId,auth.identity.roles]) : '';
  useEffect(() => {
    const controller = new AbortController();
    pending.current?.abort();
    if (loadedIdentity.current !== identityKey) {
      setCampuses([]); setCampusId(''); setPage(1); loadedIdentity.current = identityKey;
    }
    setEntries([]); setSelected(null); setHasMore(false); setLoading(true); setError('');
    void loadAccessCampuses(controller.signal).then(rows => {
      if (controller.signal.aborted) return;
      setCampuses(rows); setCampusId(current => rows.some(row => row.id === current) ? current : rows[0]?.id ?? ''); setLoading(false);
    }).catch(reason => { if (!controller.signal.aborted) { fail(reason); setLoading(false); } });
    return () => controller.abort();
  }, [identityKey,reload]);
  useEffect(() => {
    if (!campusId) return;
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    setLoading(true); setError(''); setSelected(null); setEntries([]); setHasMore(false);
    void loadAuditEntries(campusId,page,controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setEntries(result.data); setHasMore(result.meta.hasMore); setLoading(false);
    }).catch(reason => { if (!controller.signal.aborted) { fail(reason); setLoading(false); } });
    return () => controller.abort();
  }, [campusId,page,reload]);
  useEffect(() => () => pending.current?.abort(), []);
  async function select(id: string) {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setSelected(null); setError(''); setLoading(true);
    try {
      const detail = await loadAuditEntry(campusId,id,controller.signal);
      if (!controller.signal.aborted) setSelected(detail);
    } catch (reason) { if (!controller.signal.aborted) fail(reason); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  return <ScrollView style={styles.page} contentContainerStyle={styles.container}>
    <Link href="/profile" style={styles.link}>Volver a mi perfil</Link>
    <Text style={styles.brand}>CAMPUSLINK</Text>
    <Text style={styles.title}>Historial administrativo</Text>
    <Text style={styles.description}>Acciones registradas en los campus que administras. Los datos anteriores y posteriores corresponden al momento del cambio.</Text>
    <Text style={styles.label}>Campus</Text>
    <View style={local.choices}>{campuses.map(campus => <Pressable key={campus.id} accessibilityRole="button"
      accessibilityState={{ selected: campus.id === campusId }} style={[local.choice,campus.id === campusId && local.active]}
      onPress={() => { if (campus.id !== campusId) { pending.current?.abort(); setSelected(null); setEntries([]); setPage(1); setCampusId(campus.id); } }}>
      <Text style={styles.description}>{campus.name}</Text>
    </Pressable>)}</View>
    {loading && <ActivityIndicator color="#74C69D" accessibilityLabel="Consultando historial" />}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!error && !loading && <Pressable accessibilityRole="button" style={styles.button} onPress={() => setReload(value => value + 1)}>
      <Text style={styles.buttonText}>Reintentar</Text></Pressable>}
    {!loading && !error && !campuses.length && <Text style={styles.description}>No tienes campus activos para administrar.</Text>}
    {!loading && !error && campusId && !entries.length && <Text style={styles.description}>No hay acciones registradas en este campus.</Text>}
    {!selected && entries.map(entry => <Pressable key={entry.id} accessibilityRole="button" disabled={loading} style={local.card} onPress={() => void select(entry.id)}>
      <Text style={styles.label}>{auditLabels[entry.accion] ?? entry.accion}</Text>
      <Text style={styles.description}>{date(entry.created_at)}</Text>
      <Text selectable style={styles.description}>{auditLabels[entry.entidad_tipo] ?? entry.entidad_tipo}: {entry.entidad_id}</Text>
      <Text selectable style={styles.description}>Administrador: {entry.actor_usuario_id ?? 'No registrado'}</Text>
      <Text style={styles.link}>Ver detalle</Text>
    </Pressable>)}
    {!!campusId && !selected && <View style={local.choices}>
      <Pressable accessibilityRole="button" disabled={loading || page === 1} style={[local.choice,(loading || page === 1) && styles.disabled]} onPress={() => setPage(value => value - 1)}><Text style={styles.link}>Anterior</Text></Pressable>
      <Text style={styles.description}>Página {page}</Text>
      <Pressable accessibilityRole="button" disabled={loading || !hasMore} style={[local.choice,(loading || !hasMore) && styles.disabled]} onPress={() => setPage(value => value + 1)}><Text style={styles.link}>Siguiente</Text></Pressable>
    </View>}
    {selected && <View style={local.detail}>
      <Text style={styles.title}>Detalle de la acción</Text>
      <Text style={styles.label}>{auditLabels[selected.accion] ?? selected.accion}</Text>
      <Text selectable style={styles.description}>Registro: {selected.id}</Text>
      <Text style={styles.description}>Fecha: {date(selected.created_at)}</Text>
      <Text selectable style={styles.description}>Campus: {campuses.find(row => row.id === selected.campus_id)?.name ?? selected.campus_id} ({selected.campus_id})</Text>
      <Text selectable style={styles.description}>Administrador: {selected.actor_usuario_id ?? 'No registrado'}</Text>
      <Text selectable style={styles.description}>{auditLabels[selected.entidad_tipo] ?? selected.entidad_tipo}: {selected.entidad_id}</Text>
      <Text selectable style={styles.description}>Justificación: {selected.justificacion_accion ?? 'No registrada'}</Text>
      {selected.reporte_contenido_id && <Text selectable style={styles.description}>Denuncia: {selected.reporte_contenido_id}</Text>}
      <Snapshot title="Antes" value={selected.datos_antes} />
      <Snapshot title="Después" value={selected.datos_despues} />
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => setSelected(null)}><Text style={styles.buttonText}>Cerrar detalle</Text></Pressable>
    </View>}
  </ScrollView>;
}
const local = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  choice: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#486476', borderRadius: 12 },
  active: { borderColor: '#74C69D', backgroundColor: '#173C42' },
  card: { padding: 16, borderRadius: 14, backgroundColor: '#102A3F', gap: 6 },
  detail: { gap: 12, paddingTop: 8 }, field: { gap: 4 },
  assignment: { padding: 10, borderLeftWidth: 2, borderLeftColor: '#486476', marginTop: 6 },
});
