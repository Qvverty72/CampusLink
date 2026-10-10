import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useActivityReport } from '../hooks/useActivityReport';
import { useAuth } from '@/features/auth/AuthProvider';

/** Embedded in the existing activity modal, not a new route or administrative screen. */
export function ReportActivityForm({ activityId, title, onBack }: {
  activityId: string; title: string; onBack: () => void;
}) {
  const { identity, session } = useAuth();
  return <ActivityReportFields key={JSON.stringify([identity?.userId, identity?.campusId, session?.access_token, activityId])}
    activityId={activityId} title={title} onBack={onBack} />;
}

function ActivityReportFields({ activityId, title, onBack }: { activityId: string; title: string; onBack: () => void }) {
  const [reason, setReason] = useState(''); const [description, setDescription] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const { submit, busy, error, receipt } = useActivityReport(activityId);
  const send = () => {
    if (!reason.trim() || reason.trim().length > 200 || description.trim().length > 2000) {
      setValidation('Escribe un motivo de hasta 200 caracteres y una descripción opcional de hasta 2000.'); return;
    }
    setValidation(null); void submit({ reason: reason.trim(), ...(description.trim() ? { description: description.trim() } : {}) });
  };
  return <View style={styles.form}>
    <Text accessibilityRole="header" style={styles.title}>Denunciar actividad</Text>
    <Text style={styles.text}>{title}</Text>
    {receipt ? <>
      <Text accessibilityLiveRegion="polite" style={styles.heading}>Denuncia enviada. Quedó pendiente de revisión.</Text>
      <Text style={styles.text}>Fecha: {new Date(receipt.reportedAt).toLocaleString('es-CL')}</Text>
      <Text style={styles.text}>Enviar la denuncia no oculta la actividad ni cambia las inscripciones.</Text>
    </> : <>
      <Text style={styles.text}>Describe el motivo para que la administración de tu campus pueda revisar el caso. La actividad seguirá visible mientras se revisa.</Text>
      <Text style={styles.heading}>Motivo (obligatorio)</Text>
      <TextInput accessibilityLabel="Motivo de la denuncia" value={reason} onChangeText={setReason}
        editable={!busy} maxLength={200} placeholder="¿Por qué denuncias esta actividad?" style={styles.input} />
      <Text style={styles.heading}>Descripción (opcional)</Text>
      <TextInput accessibilityLabel="Descripción de la denuncia" value={description} onChangeText={setDescription}
        editable={!busy} maxLength={2000} multiline textAlignVertical="top" placeholder="Explica lo ocurrido" style={[styles.input, styles.description]} />
      {validation || error ? <Text accessibilityRole="alert" style={styles.error}>{validation ?? error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy, busy }} onPress={send}
        style={[styles.send, busy && { opacity: 0.6 }]}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sendText}>Enviar denuncia</Text>}
      </Pressable>
    </>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={onBack} style={styles.back}>
      <Text style={styles.link}>Volver a la ficha</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  form: { gap: 12, paddingVertical: 12 }, title: { fontSize: 21, fontWeight: '700', color: '#0F172A' },
  heading: { fontSize: 16, fontWeight: '600', color: '#0F172A' }, text: { color: '#334155', lineHeight: 22 },
  input: { padding: 12, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, color: '#0F172A', backgroundColor: '#FFFFFF' },
  description: { minHeight: 110 }, error: { color: '#B91C1C', lineHeight: 22 },
  send: { padding: 14, borderRadius: 10, backgroundColor: '#0B6E75', alignItems: 'center' },
  sendText: { color: '#FFFFFF', fontWeight: '700' }, back: { paddingVertical: 12 }, link: { color: '#0B6E75', fontWeight: '700' },
});
