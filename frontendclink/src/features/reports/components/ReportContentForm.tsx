import { APP_COLORS } from '@/types/colors';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useContentReport } from '../hooks/useContentReport';
import { useAuth } from '@/features/auth/AuthProvider';
import type { ReportTarget } from '../types/report';

/** Embed in the existing detail. The caller supplies the persisted target and its campus. */
export function ReportContentForm(props: { target: ReportTarget; title: string; onBack: () => void }) {
  const { identity, session } = useAuth();
  return <ReportFields key={JSON.stringify([identity?.userId, identity?.campusId, session?.access_token,
    props.target.targetType, props.target.targetId, props.target.campusId])} {...props} />;
}

function ReportFields({ target, title, onBack }: { target: ReportTarget; title: string; onBack: () => void }) {
  const [reason, setReason] = useState(''); const [description, setDescription] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const { submit, busy, error, receipt } = useContentReport(target);
  const label = target.targetType === 'ACTIVIDAD' ? 'actividad'
    : target.targetType === 'TRANSACCION' ? 'transacción' : 'publicación';
  const send = () => {
    if (!reason.trim() || reason.trim().length > 200 || description.trim().length > 2000) {
      setValidation('Escribe un motivo de hasta 200 caracteres y una descripción opcional de hasta 2000.'); return;
    }
    setValidation(null); void submit({ reason: reason.trim(), ...(description.trim() ? { description: description.trim() } : {}) });
  };
  return <View style={styles.form}>
    <Text accessibilityRole="header" style={styles.title}>Denunciar {label}</Text>
    <Text style={styles.text}>{title}</Text>
    {receipt ? <>
      <Text accessibilityLiveRegion="polite" style={styles.heading}>Denuncia enviada. Quedó pendiente de revisión.</Text>
      <Text style={styles.text}>Fecha: {new Date(receipt.reportedAt).toLocaleString('es-CL')}</Text>
      <Text style={styles.text}>La administración de este campus revisará el caso.</Text>
    </> : <>
      <Text style={styles.text}>Describe el motivo para que la administración de este campus pueda revisar el caso.</Text>
      <Text style={styles.heading}>Motivo (obligatorio)</Text>
      <TextInput accessibilityLabel="Motivo de la denuncia" value={reason} onChangeText={setReason}
        editable={!busy} maxLength={200} placeholder={`¿Por qué denuncias esta ${label}?`} style={styles.input} />
      <Text style={styles.heading}>Descripción (opcional)</Text>
      <TextInput accessibilityLabel="Descripción de la denuncia" value={description} onChangeText={setDescription}
        editable={!busy} maxLength={2000} multiline textAlignVertical="top" placeholder="Explica lo ocurrido" style={[styles.input, styles.description]} />
      {validation || error ? <Text accessibilityRole="alert" style={styles.error}>{validation ?? error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy, busy }} onPress={send}
        style={[styles.send, busy && { opacity: 0.6 }]}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sendText}>Enviar denuncia</Text>}
      </Pressable>
    </>}
    <Text style={styles.text}>Enviar una denuncia no oculta el contenido ni modifica transacciones o inscripciones.</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={onBack} style={styles.back}>
      <Text style={styles.link}>Volver al detalle</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  form: { gap: 12, paddingVertical: 12 }, title: { fontSize: 21, fontWeight: '700', color: '#0F172A' },
  heading: { fontSize: 16, fontWeight: '600', color: '#0F172A' }, text: { color: '#334155', lineHeight: 22 },
  input: { padding: 12, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, color: '#0F172A', backgroundColor: '#FFFFFF' },
  description: { minHeight: 110 }, error: { color: '#B91C1C', lineHeight: 22 },
  send: { padding: 14, borderRadius: 10, backgroundColor: APP_COLORS.PRIMARY, alignItems: 'center' },
  sendText: { color: '#FFFFFF', fontWeight: '700' }, back: { paddingVertical: 12 }, link: { color: APP_COLORS.PRIMARY, fontWeight: '700' },
});
