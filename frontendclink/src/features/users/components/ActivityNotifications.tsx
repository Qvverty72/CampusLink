import { Link,useRouter } from 'expo-router';
import {useState} from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { ActivityDetail } from '@/features/activities/components/ActivityDetail';
import { ActivityRefreshScrollView } from '@/features/activities/components/ActivityRefreshScrollView';
import { useActivityNotifications } from '../hooks/useActivityNotifications';
import {PhysicalgoodsHistoryDetail} from '@/features/marketplace/physicalgoods/components/PhysicalgoodsHistory';
import {PhysicalgoodsTransaction} from '@/features/marketplace/physicalgoods/components/PhysicalgoodsTransaction';
import type {PhysicalgoodsTransactionTarget} from '@/features/marketplace/physicalgoods/types/publication';

/** Pantalla de notificaciones; los cambios visibles esperan confirmación del servidor. */
export function NotificationsScreen() {
  const { identity, session } = useAuth();
  return <NotificationsContent key={JSON.stringify([identity?.userId, identity?.campusId, session?.access_token])} />;
}

function NotificationsContent() {
  const { items, cursor, busy, error, activityId, setActivityId, publicationId,setPublicationId,load, update } = useActivityNotifications();
  const router=useRouter(),[agreement,setAgreement]=useState<PhysicalgoodsTransactionTarget|null>(null);
  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <Link href="/profile" asChild><Pressable accessibilityRole="button"><Text style={[styles.link, styles.headerLink]}>Volver a mi perfil</Text></Pressable></Link>
      <Text accessibilityRole="header" style={styles.title}>Notificaciones</Text>
      <Pressable disabled={busy} accessibilityRole="button" onPress={() => { void load(); }}><Text style={[styles.link, styles.headerLink]}>Actualizar notificaciones</Text></Pressable>
      {busy ? <ActivityIndicator /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {!busy && !error && !items.length ? <Text style={[styles.text, styles.headerLink]}>No tienes notificaciones en este momento.</Text> : null}
      {items.map(item => <View key={item.id} style={styles.card}>
        <Text style={styles.type}>{item.type==='PHYSICAL_PUBLICATION_CLOSE_REMINDER'?'Revisar cierre de publicación':item.type === 'OFFICIAL_EVENT_PUBLISHED' ? 'Evento oficial publicado'
          : item.type === 'OFFICIAL_EVENT_STARTED' ? 'Evento oficial en curso' : 'Cambios en tu actividad'}{item.readAt ? '' : ' · Sin leer'}</Text>
        <Text accessibilityRole="header" style={styles.heading}>{item.title}</Text>
        <Text style={styles.text}>{item.message}</Text>
        <Text style={styles.text}>{new Date(item.createdAt).toLocaleString('es-CL')}</Text>
        <Pressable disabled={busy} accessibilityRole="button" onPress={() => { void update(item, false); }}><Text style={styles.link}>{item.type==='PHYSICAL_PUBLICATION_CLOSE_REMINDER'?'Revisar publicación':'Ver actividad'}</Text></Pressable>
        <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={`Eliminar notificación de ${item.title}`}
          onPress={() => { void update(item, true); }}><Text style={styles.remove}>Eliminar notificación</Text></Pressable>
      </View>)}
      {cursor ? <Pressable disabled={busy} accessibilityRole="button" onPress={() => { void load(cursor); }}><Text style={[styles.link, styles.headerLink]}>Cargar más</Text></Pressable> : null}
    </ScrollView>
    <Modal visible={!!activityId} transparent animationType="slide" onRequestClose={() => setActivityId(null)}>
      <View style={styles.overlay}><ActivityRefreshScrollView style={styles.modal} contentContainerStyle={{ padding: 20 }} onClose={() => setActivityId(null)}>
        {activityId ? <ActivityDetail key={activityId} activityId={activityId} onBack={() => setActivityId(null)}
          onSelectOccurrence={setActivityId} /> : null}
      </ActivityRefreshScrollView></View>
    </Modal>
    {publicationId&&<PhysicalgoodsHistoryDetail key={publicationId} target={{publicationId}} onClose={()=>setPublicationId(null)}
      onAgreement={(id,transactionId)=>{setPublicationId(null);setAgreement({publicationId:id,transactionId});}}
      onOpen={id=>{setPublicationId(null);router.push({pathname:'/physicalgoods',params:{publicationId:id}});}} />}
    {agreement&&<PhysicalgoodsTransaction key={agreement.transactionId} target={agreement} onChanged={()=>void load()} onClose={()=>setAgreement(null)} />}
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
