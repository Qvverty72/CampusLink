import { useState } from 'react';
import { Text, View } from 'react-native';
import { BottomSheet, Button, Card, Chip, Field, Screen, go, ui, useToast } from '@/components/ui';
import { Wizard } from '@/components/Wizard';
import { emptyActivity, validateActivityStep, type ActivityDraft } from '@/mocks/activityDraft';

export function CreateActivityScreen() {
  const [draft, setDraft] = useState<ActivityDraft>({ ...emptyActivity });
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [published, setPublished] = useState(false);
  const toast = useToast();
  const set = (field: keyof ActivityDraft, value: string) => setDraft((previous) => ({ ...previous, [field]: value }));
  if (published) return <Screen title="Publicación creada"><Card><Text style={ui.heading}>{draft.title}</Text><Text style={ui.body}>Tu actividad se publicó de forma simulada.</Text><Text style={ui.muted}>No se guardó en un servidor ni se agregó al catálogo de ejemplo.</Text></Card><Button label="Ver actividades" onPress={() => go('/activities')} /><Button secondary label="Crear otro ejemplo" onPress={() => { setDraft({ ...emptyActivity }); setPublished(false); }} /></Screen>;
  return <Screen title="Crear actividad">
    <Text style={ui.muted}>Actividad comunitaria · Borrador local de demostración.</Text>
    <Wizard onFinish={() => { setPublished(true); toast('Publicación creada · simulación'); }} steps={[
      { title: 'Información', validate: () => validateActivityStep(draft, 0), content: <View style={ui.section}>
        <Field label="Nombre de la actividad" placeholder="Encuentro de estudio" value={draft.title} onChangeText={(value) => set('title', value)} />
        <Field label="Descripción (opcional)" placeholder="Cuéntale a tu comunidad de qué se trata." multiline value={draft.description} onChangeText={(value) => set('description', value)} />
      </View> },
      { title: 'Fecha y hora', validate: () => validateActivityStep(draft, 1), content: <View style={ui.section}>
        <Field label="Fecha · AAAA-MM-DD" placeholder="2026-10-15" value={draft.date} onChangeText={(value) => set('date', value)} autoCapitalize="none" />
        <Field label="Hora · HH:MM" placeholder="13:00" value={draft.time} onChangeText={(value) => set('time', value)} autoCapitalize="none" />
      </View> },
      { title: 'Ubicación', validate: () => validateActivityStep(draft, 2), content: <View style={ui.section}>
        <Text style={ui.body}>Selecciona un lugar de ejemplo.</Text><Button secondary label={draft.location || 'Elegir ubicación'} onPress={() => setLocationsOpen(true)} /><Text style={ui.muted}>Esta selección no modifica el mapa 3D.</Text>
      </View> },
      { title: 'Revisión', content: <Card><Text style={ui.heading}>{draft.title}</Text><Text style={ui.body}>{draft.description || 'Sin descripción adicional.'}</Text><Text style={ui.body}>{draft.date} · {draft.time}</Text><Text style={ui.body}>{draft.location}</Text><Text style={ui.muted}>Comunitaria · Organiza Alex Muñoz (mock). Usa Atrás para corregir los datos.</Text></Card> },
      { title: 'Publicar', content: <Card><Text style={ui.heading}>Todo listo para compartir</Text><Text style={ui.body}>{draft.title}</Text><Text style={ui.muted}>Al publicar verás una confirmación de ejemplo. No se enviará información ni se creará una actividad real.</Text></Card> },
    ]} />
    <BottomSheet visible={locationsOpen} title="Ubicación de ejemplo" onClose={() => setLocationsOpen(false)}>
      {['Patio central', 'Biblioteca', 'Auditorio'].map((location) => <Chip key={location} label={location} selected={draft.location === location} onPress={() => { set('location', location); setLocationsOpen(false); }} />)}
    </BottomSheet>
  </Screen>;
}
