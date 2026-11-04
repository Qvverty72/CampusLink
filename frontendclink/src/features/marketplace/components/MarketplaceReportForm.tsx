import { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Flag } from 'lucide-react-native';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useContentReport } from '@/features/reports/hooks/useContentReport';
import {ContentReportConfirmation} from '@/features/reports/components/ContentReportConfirmation';
import {Skeleton,SkeletonBlock} from '@/components/Skeleton';
import { MARKETPLACE_REPORT_REASONS, type MarketplaceReportTarget } from '../types/report';
import { CATALOG_COLORS as c } from './CatalogUI';
import { PublicationFeedback, PublicationSubmit, publicationUI as f } from './PublicationFormUI';

interface Props { target: MarketplaceReportTarget; title: string; onBack: () => void; onBusyChange?: (busy: boolean) => void; showHeading?: boolean; backLabel?: string | null }
export function MarketplaceReportForm(props: Props) {
  const { identity } = useAuth();
  return <ReportFields key={JSON.stringify([identity?.userId, identity?.campusId, props.target])} {...props} />;
}
function ReportFields({ target, title, onBack, onBusyChange, showHeading = true, backLabel }: Props) {
  const [choice, setChoice] = useState(''), [customReason, setCustomReason] = useState(''), [description, setDescription] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const report = useContentReport(target), transaction = target.type === 'TRANSACCION' || target.type === 'TRANSACCION_DIGITAL';
  const options = MARKETPLACE_REPORT_REASONS.filter(option => transaction || option.id !== 'exchange');
  const selected = options.find(option => option.id === choice);
  const reason = selected?.id === 'other' ? customReason.trim() : selected?.label ?? '';
  useEffect(() => { onBusyChange?.(report.busy); return () => onBusyChange?.(false); }, [report.busy, onBusyChange]);
  function send() {
    if (report.busy || report.receipt || report.checking || report.lookupError) return;
    if (!reason || reason.length > 200 || description.trim().length > 2000) { setValidation('Selecciona un motivo o escribe otro de hasta 200 caracteres.'); return; }
    setValidation(null); void Promise.resolve(report.submit({ reason, ...(description.trim() ? { description: description.trim() } : {}) })).then(receipt=>{if(receipt)Keyboard.dismiss();});
  }
  const back=backLabel!==null&&<Pressable accessibilityRole="button" disabled={report.busy} onPress={onBack} style={f.secondary}><Text style={f.actionText}>{backLabel??(transaction?'Volver al acuerdo':'Volver al detalle')}</Text></Pressable>;
  if(report.checking)return <View style={f.section}><Skeleton label="Consultando tu denuncia" contentStyle={{gap:12}}><SkeletonBlock width="65%" height={24}/><SkeletonBlock height={160} borderRadius={14}/><SkeletonBlock height={72} borderRadius={12}/></Skeleton>{back}</View>;
  if(report.lookupError)return <View style={f.section}><PublicationFeedback error={report.lookupError}/><PublicationSubmit label="Reintentar consulta de denuncia" disabled={false} onPress={report.retryLookup}/>{back}</View>;
  if(report.receipt)return <View style={f.section}><ContentReportConfirmation title={title} transaction={transaction} receipt={report.receipt} reason={report.receipt.reason??reason} description={report.receipt.description===undefined?description:report.receipt.description}/>{back}</View>;
  return <View style={f.form}>
    <View style={f.section}>
      {showHeading && <View style={styles.heading}><Flag size={20} color={c.primary} /><Text accessibilityRole="header" style={f.title}>{transaction ? 'Denunciar transacción' : 'Denunciar publicación'}</Text></View>}
      <Text style={f.label}>{title}</Text>
      <>
        <Text style={f.notice}>La denuncia no elimina el contenido ni modifica la transacción. La revisará un administrador con permisos en el campus de origen.</Text>
        <Text style={f.label}>Selecciona un motivo *</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Motivos de la denuncia" style={styles.options}>{options.map(option => <Pressable key={option.id}
          accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: choice === option.id, disabled: report.busy }} aria-checked={choice === option.id}
          disabled={report.busy} onPress={() => { setChoice(option.id); setValidation(null); }} style={[styles.option, choice === option.id && f.selected, report.busy && f.disabled]}>
          <View style={[styles.radio, choice === option.id && styles.radioSelected]}>{choice === option.id && <Check size={14} color={c.primary} />}</View>
          <View style={styles.optionText}><Text style={f.actionText}>{option.label}</Text><Text style={f.hint}>{option.hint}</Text></View>
        </Pressable>)}</View>
        {choice === 'other' && <View style={f.field}><Text style={f.label}>Otro motivo *</Text><TextInput accessibilityLabel="Otro motivo de denuncia" value={customReason}
          onChangeText={setCustomReason} editable={!report.busy} maxLength={200} placeholder="Indica el motivo" style={f.input} /></View>}
        <View style={f.field}><Text style={f.label}>Descripción (opcional)</Text><TextInput accessibilityLabel="Descripción de la denuncia" value={description} onChangeText={setDescription}
          editable={!report.busy} maxLength={2000} multiline placeholder="Explica lo ocurrido sin incluir datos personales innecesarios" style={[f.input, f.textarea]} />
          <Text style={f.hint}>{description.length}/2000 caracteres</Text></View>
        <PublicationFeedback error={validation ?? report.error} />
        <PublicationSubmit label={report.busy ? 'Enviando denuncia…' : 'Enviar denuncia'} busy={report.busy} disabled={report.busy || !reason} onPress={send} />
      </>
      {back}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  heading: { flexDirection: 'row', gap: 10, alignItems: 'center' }, options: { gap: 8 },
  option: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: c.border, borderRadius: 12 },
  optionText: { flex: 1, minWidth: 0 }, radio: { height: 22, width: 22, borderWidth: 1, borderColor: c.inputBorder, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: c.primary },
});
