import { useEffect, useRef, type ComponentRef, type Ref } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { ArrowRight, Check, CheckCheck, ShieldCheck } from 'lucide-react-native';
import type { useReportReviews } from '../hooks/useReportReviews';
import { reportTitle } from '../utils/reportPresentation';
import { focusReport, ReportButton, ReportIcon, type ReportFocusTarget } from './ReportUI';
import { reportStyles as s, reportColors as c } from './reports.styles';
type Review = ReturnType<typeof useReportReviews>;

export function ReportResolutionForm({ review, campusName, headingRef }: { review: Review; campusName: string; headingRef?: Ref<ComponentRef<typeof Text>> }) {
  const input = review.resolutionInput, disabled = review.resolving || review.resolutionNeedsReload;
  const confirmRef = useRef<ReportFocusTarget>(null), inputRef = useRef<ComponentRef<typeof TextInput>>(null), choicesRef = useRef<ReportFocusTarget>(null);
  const errorRef = useRef<ComponentRef<typeof Text>>(null), previousConfirm = useRef(false);
  useEffect(() => {
    if (review.confirmingResolution) focusReport(confirmRef.current);
    else if (previousConfirm.current) inputRef.current?.focus();
    previousConfirm.current = !!review.confirmingResolution;
  }, [review.confirmingResolution]);
  useEffect(() => {
    if (review.resolutionError) focusReport(review.resolutionNeedsReload ? errorRef.current : input.decision ? inputRef.current : choicesRef.current);
  }, [review.resolutionError, review.resolutionNeedsReload]);
  const accepted = input.decision === 'ACOGER';
  const consequence = accepted
    ? review.detail?.entityType === 'TRANSACCION'
      ? 'Se ocultará la publicación vinculada a este intercambio. El acuerdo y los accesos adquiridos se conservan.'
      : review.detail?.entityType === 'ACTIVIDAD'
        ? 'Se ocultará sólo esta ocurrencia de la actividad. Las inscripciones y el historial se conservan.'
        : 'Se ocultará el contenido. Las solicitudes, transacciones, archivos y accesos adquiridos se conservan.'
    : 'La denuncia se cerrará sin aplicar una medida. El contenido conservará su estado actual.';
  return <View style={s.card}>
    <View style={s.row}><ReportIcon icon={ShieldCheck} /><Text ref={headingRef} tabIndex={-1} accessibilityRole="header" style={s.sectionTitle}>Resolver denuncia</Text></View>
    {review.resolutionInProgress ? <View style={s.message}><Text style={s.label}>Decisión registrada; falta completar el cierre</Text><Text style={s.body}>Completa la resolución con la decisión ya registrada. Se conservan el responsable, la fecha y la justificación originales.</Text></View> : !review.confirmingResolution && <>
      <View style={s.smallStack}><View style={s.row}><View style={s.step}><Text style={s.linkText}>1</Text></View><Text style={s.label}>Elige una decisión</Text></View>
        <View ref={choicesRef} tabIndex={-1} accessibilityRole="radiogroup" accessibilityLabel="Decisión de la denuncia" style={s.smallStack}>
          {(['DESESTIMAR', 'ACOGER'] as const).map(decision => {
            const selected = input.decision === decision;
            return <Pressable key={decision} accessibilityRole="radio" accessibilityLabel={decision === 'ACOGER' ? 'Acoger y ocultar contenido' : 'Desestimar denuncia'}
              accessibilityState={{ checked: selected, disabled }} aria-checked={selected} disabled={disabled} onPress={() => review.editResolution({ decision })}
              style={[s.choice, selected && s.choiceSelected, disabled && s.disabled]}>
              <View style={s.topRow}><View style={[s.radio, selected && s.radioSelected]}>{selected && <ReportIcon icon={Check} size={14} color="#FFFFFF" />}</View>
                <View style={[s.grow, s.smallStack]}><Text style={s.label}>{decision === 'ACOGER' ? 'Acoger y ocultar contenido' : 'Desestimar denuncia'}</Text>
                  <Text style={s.small}>{decision === 'ACOGER' ? 'Aplicar una medida de visibilidad, conservando los antecedentes y los accesos adquiridos.' : 'Cerrar el caso sin cambiar el estado del contenido.'}</Text></View>
              </View>
            </Pressable>;
          })}
        </View>
      </View>
      <View style={s.smallStack}><View style={s.row}><View style={s.step}><Text style={s.linkText}>2</Text></View><Text style={s.label}>Justificación obligatoria</Text></View>
        <Text style={s.small}>Quedará registrada con tu usuario y la fecha</Text>
        <TextInput ref={inputRef} accessibilityLabel="Justificación de la resolución" accessibilityHint="Obligatoria. Hasta 2000 caracteres." multiline maxLength={2000}
          style={[s.input, !!review.resolutionError && !review.resolutionNeedsReload && !!input.decision && s.inputError]} editable={!disabled && !review.confirmingResolution}
          value={input.justification} onChangeText={justification => review.editResolution({ justification })} placeholder="Explica los antecedentes que respaldan tu decisión" placeholderTextColor={c.muted} />
        <Text style={[s.small, { alignSelf: 'flex-end' }]}>{input.justification.length}/2000</Text>
      </View>
    </>}
    {!!review.resolutionError && <View style={[s.message, s.errorBox]}><Text ref={errorRef} tabIndex={-1} accessibilityRole="alert" style={[s.body, s.errorText]}>{review.resolutionError}</Text>
      {review.resolutionNeedsReload && <Text style={s.small}>El envío podría haberse registrado. Actualiza el caso antes de intentar otra decisión.</Text>}
    </View>}
    {review.resolutionNeedsReload ? <ReportButton secondary onPress={review.retry}>Actualizar caso</ReportButton> : review.confirmingResolution ? <View style={s.confirm}>
      <Text ref={confirmRef} tabIndex={-1} accessibilityRole="header" style={s.sectionTitle}>Confirma tu decisión</Text>
      <Text style={s.label}>{reportTitle(review.detail?.title)}</Text><Text style={s.small}>{campusName}</Text>
      <View style={s.field}><Text style={s.small}>Decisión y medida</Text><Text style={s.label}>{accepted ? 'Acoger y ocultar contenido' : 'Desestimar denuncia · Sin medida'}</Text><Text style={s.body}>{consequence}</Text></View>
      <View style={s.field}><Text style={s.small}>Justificación que se registrará</Text><Text selectable style={s.body}>{input.justification}</Text></View>
      <Text style={s.small}>Si el contenido ya está oculto o retirado, se conserva ese estado. La resolución será definitiva y no podrá editarse.</Text>
      <ReportButton busy={review.resolving} onPress={() => void review.confirmResolution()} icon={CheckCheck}>{review.resolving ? 'Registrando resolución…' : review.resolutionInProgress ? 'Confirmar cierre del caso' : accepted ? 'Confirmar y ocultar' : 'Confirmar desestimación'}</ReportButton>
      <ReportButton secondary disabled={review.resolving} onPress={review.cancelResolution}>{review.resolutionInProgress ? 'Volver a la decisión' : 'Volver a editar'}</ReportButton>
    </View> : <ReportButton onPress={review.requestResolution} icon={ArrowRight}>{review.resolutionInProgress ? 'Completar resolución' : 'Revisar decisión'}</ReportButton>}
  </View>;
}
