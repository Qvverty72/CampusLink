import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Button, back, ui } from './ui';
import { colors } from '@/theme/tokens';

export type WizardStep = { title: string; content: ReactNode; validate?: () => string | null };
export function StepIndicator({ labels, current }: { labels: string[]; current: number }) {
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: labels.length, now: current + 1, text: `Paso ${current + 1}: ${labels[current]}` }} style={{ gap: 10 }}>
    <Text style={ui.label}>Paso {current + 1} de {labels.length} · {labels[current]}</Text>
    <View style={ui.row}>{labels.map((label, index) => <View key={label} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: index <= current ? colors.brandPrimary : colors.border }} />)}</View>
  </View>;
}

/** Step content/state belongs to the module; progression and validation are shared. */
export function Wizard({ steps, onFinish, finishLabel = 'Publicar (simulado)' }: { steps: WizardStep[]; onFinish: () => void; finishLabel?: string }) {
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState('');
  const move = (index: number) => { setError(''); setCurrent(index); };
  const next = () => {
    const invalid = steps[current].validate?.();
    if (invalid) { setError(invalid); return; }
    if (current === steps.length - 1) {
      const firstInvalid = steps.findIndex((step) => !!step.validate?.());
      if (firstInvalid >= 0) { move(firstInvalid); setError(steps[firstInvalid].validate?.() ?? 'Revisa los datos.'); return; }
      onFinish();
    } else move(current + 1);
  };
  return <View style={{ gap: 20 }}>
    <StepIndicator labels={steps.map((step) => step.title)} current={current} />
    {steps[current].content}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    <View style={ui.row}><Button secondary label="Atrás" onPress={() => current ? move(current - 1) : back()} /><View style={ui.grow}><Button label={current === steps.length - 1 ? finishLabel : 'Siguiente'} onPress={next} /></View></View>
  </View>;
}
