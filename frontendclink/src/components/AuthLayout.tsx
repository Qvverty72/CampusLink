import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Screen, ui } from './ui';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return <Screen title={title}><View style={{ width: '100%', maxWidth: 440, alignSelf: 'center', gap: 20 }}>
    <Text style={ui.muted}>Acceso de demostración. Usa datos ficticios; no se envían ni se guardan credenciales.</Text>{children}
  </View></Screen>;
}
