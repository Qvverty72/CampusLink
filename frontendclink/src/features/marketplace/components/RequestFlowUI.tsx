import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { CATALOG_COLORS as colors, ui } from './CatalogUI';
import { PersonalStatus, personalStatusLabel } from './PersonalUI';
import { RequestResourceSummary, detailUI } from './ResourceDetailUI';

export function requestTimelineSteps(status: string, transactionStatus?: string, digital = false, donation = false) {
  const terminal = status === 'RECHAZADA' ? 'Solicitud rechazada' : status === 'CANCELADA' ? 'Solicitud cancelada' : transactionStatus === 'CANCELADA' ? 'Acuerdo cancelado' : null;
  const completed = !terminal && transactionStatus === 'COMPLETADA';
  const accepted = !terminal && (status === 'ACEPTADA' || completed);
  return [
    { label: 'Solicitud enviada', done: true, current: false, terminal: false },
    { label: accepted ? 'Solicitud aceptada' : 'Esperando respuesta', done: Boolean(accepted), current: !terminal && !accepted, terminal: false },
    { label: terminal ?? (digital ? 'Completar acuerdo' : donation ? 'Entrega y confirmación' : 'Entrega y pago'), done: Boolean(completed), current: Boolean(accepted && !completed), terminal: Boolean(terminal) },
  ];
}

/** Los pasos dependen del estado registrado, nunca del tiempo transcurrido. */
export function RequestTimeline({ status, transactionStatus, digital = false, donation = false }: { status: string; transactionStatus?: string; digital?: boolean; donation?: boolean }) {
  return <View style={detailUI.card}><Text accessibilityRole="header" style={ui.sectionTitle}>Estado</Text>
    {requestTimelineSteps(status, transactionStatus, digital, donation).map((step, index) => <View key={index} style={styles.stepRow}>
      <View style={styles.track}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.circle, step.done && styles.done, step.current && styles.current]}>
          {step.done ? <Check size={14} color={colors.surface} /> : <Text style={styles.number}>{index + 1}</Text>}
        </View>
        {index < 2 && <View style={styles.line} />}
      </View>
      <View style={styles.stepBody}><Text style={[detailUI.body, step.current && styles.bold]}>{step.label}</Text>
        <Text style={detailUI.helper}>{step.terminal ? 'Historial conservado' : step.done ? 'Completado' : step.current ? 'En curso' : 'Pendiente'}</Text></View>
    </View>)}
  </View>;
}

export function RequestSentConfirmation({ title, ownerName, modality, price, status, digital = false }: {
  title: string; ownerName: string; modality: string; price: number | null; status: string; digital?: boolean;
}) {
  const pending = status === 'PENDIENTE';
  const positive = pending || status === 'ACEPTADA';
  const steps = ['El propietario acepta o rechaza', digital ? 'Continúan con el acuerdo digital' : 'Coordinan la entrega en el campus',
    modality === 'DONACION' ? 'Confirman el intercambio' : 'Pagan entre ustedes y confirman'];
  return <View style={{ gap: 20 }}>
    <View style={styles.successHeading}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.halo}><View style={[styles.successIcon, !positive && { backgroundColor: colors.tint }]}>{positive ? <Check size={38} color={colors.surface} /> : <Text style={styles.successTitle}>—</Text>}</View></View>
      <Text accessibilityRole="header" style={styles.successTitle}>{pending ? 'Solicitud enviada' : `Solicitud ${personalStatusLabel(status).toLowerCase()}`}</Text>
      <Text style={styles.successHelper}>{pending ? `${ownerName} recibirá un aviso y podrá responder a tu solicitud.` : 'Consulta los detalles para ver el estado actual de tu solicitud.'}</Text>
      <View><PersonalStatus status={status} /></View>
    </View>
    <RequestResourceSummary title={title} modality={modality} price={price} digital={digital} />
    {pending && <View style={detailUI.card}><Text accessibilityRole="header" style={ui.sectionTitle}>¿Qué sigue?</Text>
      {steps.map((label, index) => <View key={label} style={styles.nextRow}><View style={styles.nextNumber}><Text style={styles.number}>{index + 1}</Text></View><Text style={[detailUI.body, { flex: 1 }]}>{label}</Text></View>)}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  stepRow: { flexDirection: 'row', gap: 12 }, track: { alignItems: 'center', width: 26 },
  circle: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  done: { backgroundColor: colors.primary, borderColor: colors.primary }, current: { backgroundColor: '#FFF4D9', borderColor: '#805C0A' },
  number: { color: colors.primary, fontSize: 12, fontWeight: '700' }, line: { width: 1, flex: 1, minHeight: 18, backgroundColor: colors.border },
  stepBody: { flex: 1, minWidth: 0, paddingBottom: 14, gap: 2 }, bold: { fontWeight: '700' },
  successHeading: { alignItems: 'center', gap: 12, paddingVertical: 8 }, halo: { padding: 9, borderRadius: 54, backgroundColor: colors.tint },
  successIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  successTitle: { color: colors.ink, fontSize: 28, lineHeight: 35, fontWeight: '800', textAlign: 'center' },
  successHelper: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 5 },
  nextNumber: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint },
});
