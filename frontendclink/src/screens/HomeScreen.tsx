import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActivityCard, ResourceCard } from '@/components/ContentCard';
import { NavigationTile } from '@/components/NavigationTile';
import { Badge, Button, Card, Screen, Section, go, ui } from '@/components/ui';
import { catalog } from '@/mocks/catalog';
import { colors } from '@/theme/tokens';

const adminLinks = [
  { label: 'Moderación', slug: 'moderacion' },
  { label: 'Usuarios', slug: 'usuarios' },
  { label: 'Analítica', slug: 'analitica' },
  { label: 'Reportes', slug: 'reportes' },
] as const;

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
      <Text style={ui.muted}>Centro de control</Text>
      <View style={styles.tileRow}>
        <NavigationTile icon="marketplace" title="Mis publicaciones" subtitle="Venta y donaciones" badge="2 activas" onPress={() => go('/placeholder/publicaciones')} />
        <NavigationTile icon="requests" title="Mis solicitudes" subtitle="Estado de intercambios" badge="1 pendiente" state="warning" onPress={() => go('/placeholder/solicitudes')} />
      </View>
      <View style={styles.tileRow}>
        <NavigationTile icon="transactions" title="Mis transacciones" subtitle="Historial completo" showChevron onPress={() => go('/placeholder/transacciones')} />
        <NavigationTile icon="resources" title="Mis recursos" subtitle="Guías y apuntes" badge="3 adquiridos" state="info" onPress={() => go('/placeholder/recursos')} />
      </View>
      <NavigationTile icon="activities" title="Mis actividades" subtitle="Talleres, deportes y grupos" badge="1 inscrita hoy" state="success" showChevron variant="wide" onPress={() => go('/placeholder/mis-actividades')} />
      <Button label="Crear actividad" onPress={() => go('/create/activity')} />
    </Section>
    <Section title="Administración">
      <View style={styles.adminPanel}>
        <View style={styles.adminHeading}>
          <Text style={styles.adminTitle}>Área administrativa</Text>
          <Text style={ui.muted}>Vista de ejemplo · sin roles ni permisos reales.</Text>
        </View>
        <View style={styles.adminLinks}>
          {adminLinks.map(({ label, slug }) => <Pressable
            key={slug}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => go(`/placeholder/${slug}`)}
            style={({ pressed }) => [styles.adminLink, pressed && styles.adminLinkPressed]}
          >
            <Text style={styles.adminLinkText}>{label}</Text>
          </Pressable>)}
        </View>
      </View>
    </Section>
    <Button secondary label="Explorar acceso y registro" onPress={() => go('/auth/login')} />
  </Screen>;
}

const styles = StyleSheet.create({
  tileRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  adminPanel: { padding: 16, gap: 16, borderRadius: 14, backgroundColor: colors.surfaceElevated },
  adminHeading: { gap: 4 },
  adminTitle: { color: colors.textPrimary, fontSize: 16, lineHeight: 21, fontWeight: '700' },
  adminLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  adminLink: { flexGrow: 1, flexBasis: '45%', minWidth: 0, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surface, justifyContent: 'center' },
  adminLinkPressed: { opacity: 0.62 },
  adminLinkText: { color: colors.brandPrimary, fontSize: 13, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
});
