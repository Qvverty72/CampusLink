import { useState } from 'react';
import { Text, View } from 'react-native';
import { catalog } from '@/mocks/catalog';
import { Badge, Button, Card, Confirmation, EmptyState, ImagePlaceholder, Screen, go, ui, useToast } from '@/components/ui';

export function DetailScreen({ kind, id }: { kind: string; id: string }) {
  const item = catalog.find((entry) => entry.kind === kind && entry.id === id);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const toast = useToast();
  if (!item) return <Screen title="Contenido no encontrado"><EmptyState title="Este ejemplo no está disponible" description="Regresa al inicio para explorar los contenidos de la maqueta." /><Button label="Ir a Inicio" onPress={() => go('/')} /></Screen>;
  const activity = item.kind === 'activities';
  const action = activity ? 'Inscribirme' : item.kind === 'marketplace' ? 'Solicitar recurso' : 'Solicitar';
  return <Screen title={item.title}>
    <ImagePlaceholder large label={item.kind === 'library' ? 'Archivo de ejemplo · PDF' : 'Imagen opcional · contenido de ejemplo'} />
    <View style={ui.row}><Badge>{item.badge}</Badge><Badge>{done ? activity ? 'Inscripción simulada' : 'Solicitud simulada' : 'Disponible'}</Badge></View>
    <Text style={ui.heading}>{item.highlight}</Text><Text style={ui.body}>{item.description}</Text>
    <Card>{item.facts.map((fact) => <View key={fact.label} style={ui.field}><Text style={ui.label}>{fact.label}</Text><Text style={ui.body}>{fact.value}</Text></View>)}</Card>
    <Text style={ui.label}>{activity ? 'Organiza' : 'Publicado por'}</Text><Text style={ui.body}>{item.owner}</Text><Text style={ui.muted}>Sede de demostración · Identidad ficticia</Text>
    {item.kind === 'library' && <Button secondary label="Ver vista previa" onPress={() => go(`/preview/${item.id}`)} />}
    <Button label={done ? activity ? 'Ya te inscribiste (mock)' : 'Solicitud enviada (mock)' : action} disabled={done} onPress={() => setConfirm(true)} />
    <Button secondary label="Volver al listado" onPress={() => go(`/${item.kind}`)} />
    <Text style={ui.muted}>Esta acción es simulada. No genera pagos, solicitudes ni inscripciones reales.</Text>
    <Confirmation visible={confirm} title={activity ? 'Confirmar inscripción' : 'Confirmar solicitud'} description="Se mostrará el resultado de ejemplo, sin enviar datos a un servidor." onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); setDone(true); toast(activity ? 'Te inscribiste · simulación' : 'Solicitud enviada · simulación'); }} />
  </Screen>;
}
