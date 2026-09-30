import { Text, View } from 'react-native';
import { ActivityCard, ResourceCard } from '@/components/ContentCard';
import { Badge, Button, Card, Screen, Section, go, ui } from '@/components/ui';
import { catalog } from '@/mocks/catalog';

export function HomeScreen() {
  return <Screen title="Hola, Alex" canGoBack={false}>
    <View style={ui.row}><Text style={[ui.muted, ui.grow]}>Alex Muñoz · Sede de demostración</Text><Button secondary label="Mi perfil" onPress={() => go('/placeholder/perfil')} /></View>
    <Card><Badge>Destacado · Maqueta</Badge><Text style={ui.heading}>Tu comunidad, más cerca</Text><Text style={ui.body}>Encuentra recursos para tus clases y actividades para compartir entre estudiantes.</Text>
      <View style={ui.row}><Button label="Explorar el mapa" onPress={() => go('/map')} /><Button secondary label="Ver actividades" onPress={() => go('/activities')} /></View>
    </Card>
    <Section title="Para ti">
      <Text style={ui.muted}>Una selección de ejemplo para descubrir CampusLink.</Text>
      <Section title="Recursos recomendados" action={{ label: 'Ver todos', onPress: () => go('/marketplace') }}>
        <ResourceCard item={catalog[0]} /><ResourceCard item={catalog[2]} />
      </Section>
      <Section title="Actividades próximas" action={{ label: 'Ver todas', onPress: () => go('/activities') }}><ActivityCard item={catalog[4]} /></Section>
    </Section>
    <Section title="Tu CampusLink">
      {[
        ['Mis publicaciones', 'publicaciones'], ['Mis solicitudes', 'solicitudes'], ['Mis transacciones', 'transacciones'], ['Mis recursos', 'recursos'], ['Mis actividades', 'mis-actividades'],
      ].map(([label, slug]) => <Button key={slug} label={label} secondary onPress={() => go(`/placeholder/${slug}`)} />)}
      <Button label="Crear actividad" onPress={() => go('/create/activity')} />
    </Section>
    <Section title="Administración"><Text style={ui.muted}>Vista de ejemplo · sin roles ni permisos reales.</Text>
      {['Moderación', 'Usuarios', 'Analítica', 'Reportes'].map((label, index) => <Button key={label} label={label} secondary onPress={() => go(`/placeholder/${['moderacion', 'usuarios', 'analitica', 'reportes'][index]}`)} />)}
    </Section>
    <Button secondary label="Explorar acceso y registro" onPress={() => go('/auth/login')} />
  </Screen>;
}
