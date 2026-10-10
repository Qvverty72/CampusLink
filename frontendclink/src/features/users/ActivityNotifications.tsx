import { useEffect, useRef, useState } from 'react';
import { Link } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { ActivityDetail } from '@/features/activities/components/ActivityDetail';
import { fetchNotifications, updateNotification, type ActivityNotification } from './notifications';

export function NotificationsScreen() {
  const { identity, session } = useAuth();
  return <NotificationsContent key={JSON.stringify([identity?.userId, identity?.campusId, session?.access_token])} />;
}

function NotificationsContent() {
  const { refreshIdentity } = useAuth();
  const [items, setItems] = useState<ActivityNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const handleError = (reason: unknown) => {
    setError(reason instanceof AuthApiError ? reason.message : 'No se pudo confirmar la operación. Actualiza las notificaciones.');
    if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
  };
  async function load(next?: string) {
    if (pending.current || !mounted.current) return;
    const abort = new AbortController(); pending.current = abort; setBusy(true); setError(null);
    try {
      const page = await fetchNotifications(next, abort.signal);
      if (!abort.signal.aborted) {
        setItems(current => next ? [...new Map([...current, ...page.items].map(item => [item.id, item])).values()] : page.items);
        setCursor(page.nextCursor);
      }
    } catch (reason) { if (!abort.signal.aborted) handleError(reason); }
    finally { if (!abort.signal.aborted) { pending.current = null; setBusy(false); } }
  }
  useEffect(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; pending.current?.abort(); pending.current = null; };
  }, []);
  async function update(item: ActivityNotification, remove: boolean) {
    if (pending.current || !mounted.current) return;
    const abort = new AbortController(); pending.current = abort; setBusy(true); setError(null);
    try {
      await updateNotification(item.id, remove, abort.signal);
      if (!abort.signal.aborted) {
        setItems(current => remove ? current.filter(row => row.id !== item.id)
          : current.map(row => row.id === item.id ? { ...row, readAt: row.readAt ?? new Date().toISOString() } : row));
        if (!remove) setActivityId(item.activityId);
      }
    } catch (reason) { if (!abort.signal.aborted) handleError(reason); }
    finally { if (!abort.signal.aborted) { pending.current = null; setBusy(false); } }
  }
  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <Link href="/profile" asChild><Pressable accessibilityRole="button"><Text style={[styles.link, styles.headerLink]}>Volver a mi perfil</Text></Pressable></Link>
      <Text accessibilityRole="header" style={styles.title}>Notificaciones</Text>
      <Pressable disabled={busy} accessibilityRole="button" onPress={() => { void load(); }}><Text style={[styles.link, styles.headerLink]}>Actualizar notificaciones</Text></Pressable>
      {busy ? <ActivityIndicator /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {!busy && !error && !items.length ? <Text style={[styles.text, styles.headerLink]}>No tienes notificaciones de actividades en este campus.</Text> : null}
      {items.map(item => <View key={item.id} style={styles.card}>
        <Text style={styles.type}>{item.type === 'OFFICIAL_EVENT_PUBLISHED' ? 'Evento oficial publicado' : 'Cambios en tu actividad'}{item.readAt ? '' : ' · Sin leer'}</Text>
        <Text accessibilityRole="header" style={styles.heading}>{item.title}</Text>
        <Text style={styles.text}>{item.message}</Text>
        <Text style={styles.text}>{new Date(item.createdAt).toLocaleString('es-CL')}</Text>
        <Pressable disabled={busy} accessibilityRole="button" onPress={() => { void update(item, false); }}><Text style={styles.link}>Ver actividad</Text></Pressable>
        <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={`Eliminar notificación de ${item.title}`}
          onPress={() => { void update(item, true); }}><Text style={styles.remove}>Eliminar notificación</Text></Pressable>
      </View>)}
      {cursor ? <Pressable disabled={busy} accessibilityRole="button" onPress={() => { void load(cursor); }}><Text style={[styles.link, styles.headerLink]}>Cargar más</Text></Pressable> : null}
    </ScrollView>
    <Modal visible={!!activityId} transparent animationType="slide" onRequestClose={() => setActivityId(null)}>
      <View style={styles.overlay}><ScrollView style={styles.modal} contentContainerStyle={{ padding: 20 }}>
        {activityId ? <ActivityDetail key={activityId} activityId={activityId} onBack={() => setActivityId(null)}
          onSelectOccurrence={setActivityId} /> : null}
      </ScrollView></View>
    </Modal>
    <BottomNavigationBar activeItemId="home" />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071A2B' }, content: { padding: 24, gap: 18 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '700' }, card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 18, gap: 12 },
  heading: { color: '#0F172A', fontSize: 18, fontWeight: '700' }, type: { color: '#0B6E75', fontWeight: '600' },
  text: { color: '#64748B', lineHeight: 22 }, link: { color: '#0B6E75', fontWeight: '700', paddingVertical: 10 },
  remove: { color: '#B91C1C', paddingVertical: 10 }, error: { color: '#FCA5A5' },
  headerLink: { color: '#B9CAD6' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modal: { flexGrow: 0, maxHeight: '90%', backgroundColor: '#FFFFFF', borderRadius: 16 },
});
