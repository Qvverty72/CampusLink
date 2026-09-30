import { Text } from 'react-native';
import { Button, EmptyState, Screen, go, ui } from '@/components/ui';

const titles: Record<string, string> = { perfil: 'Mi perfil', notificaciones: 'Notificaciones', publicaciones: 'Mis publicaciones', solicitudes: 'Mis solicitudes', transacciones: 'Mis transacciones', recursos: 'Mis recursos', 'mis-actividades': 'Mis actividades', moderacion: 'Moderación', usuarios: 'Usuarios', analitica: 'Analítica', reportes: 'Reportes' };
export function PlaceholderScreen({ section }: { section: string }) {
  return <Screen title={titles[section] ?? 'Sección no encontrada'}>
    <EmptyState title="Espacio de demostración" description="Esta sección es un placeholder de la maqueta. No hay información real ni operaciones conectadas." />
    {section === 'perfil' && <><Text style={ui.body}>Alex Muñoz · Sede de demostración</Text><Button label="Ir a Login / Registro" onPress={() => go('/auth/login')} /></>}
    {section === 'mis-actividades' && <Button label="Explorar actividades" onPress={() => go('/activities')} />}
    <Button secondary label="Volver a Inicio" onPress={() => go('/')} />
  </Screen>;
}
