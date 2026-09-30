export type ContentKind = 'marketplace' | 'library' | 'activities';
export type ContentItem = {
  id: string;
  kind: ContentKind;
  title: string;
  category: string;
  badge: string;
  highlight: string;
  subtitle: string;
  owner: string;
  description: string;
  facts: { label: string; value: string }[];
};

export const moduleNames: Record<ContentKind, string> = {
  marketplace: 'Marketplace', library: 'Biblioteca', activities: 'Actividades',
};

/** Fictional content only; never mixed with the live map's API/store. */
export const catalog: ContentItem[] = [
  {
    id: 'calculadora', kind: 'marketplace', title: 'Calculadora científica',
    category: 'Tecnología', badge: 'Buen estado', highlight: '$12.000',
    subtitle: 'Para acompañarte en el próximo semestre', owner: 'Camila Rojas',
    description: 'Calculadora de ejemplo, con tapa y todas sus funciones. Esta publicación es ficticia y permite recorrer el flujo de solicitud.',
    facts: [{ label: 'Condición', value: 'Usada · buen estado' }, { label: 'Entrega', value: 'A coordinar en la sede' }],
  },
  {
    id: 'kit-dibujo', kind: 'marketplace', title: 'Kit de dibujo técnico',
    category: 'Materiales', badge: 'Como nuevo', highlight: 'Donación',
    subtitle: 'Reglas, escuadras y compás', owner: 'Diego Soto',
    description: 'Un kit ficticio listo para tener una segunda vida. No se generará ninguna transacción real.',
    facts: [{ label: 'Condición', value: 'Como nuevo' }, { label: 'Entrega', value: 'Biblioteca de la sede' }],
  },
  {
    id: 'apuntes-programacion', kind: 'library', title: 'Apuntes de programación',
    category: 'Informática', badge: 'PDF', highlight: 'Gratis',
    subtitle: 'Ingeniería en Informática · Programación I', owner: 'Valentina Pérez',
    description: 'Guía ficticia con conceptos básicos y ejercicios. La vista previa es un placeholder; no hay archivos reales ni compras.',
    facts: [{ label: 'Tipo', value: 'Apuntes · PDF' }, { label: 'Carrera', value: 'Ingeniería en Informática' }, { label: 'Asignatura', value: 'Programación I' }],
  },
  {
    id: 'guia-calculo', kind: 'library', title: 'Guía de cálculo aplicada',
    category: 'Matemáticas', badge: 'PDF', highlight: '$2.000',
    subtitle: 'Plan común · Matemáticas', owner: 'Tomás Fuentes',
    description: 'Material de demostración para explorar recursos digitales. Incluye una vista previa simulada.',
    facts: [{ label: 'Tipo', value: 'Guía de ejercicios · PDF' }, { label: 'Carrera / asignatura', value: 'Plan común · Matemáticas' }],
  },
  {
    id: 'intercambio', kind: 'activities', title: 'Encuentro de intercambio',
    category: 'Comunitaria', badge: 'Comunitaria', highlight: '15 oct · 13:00',
    subtitle: 'Patio central · Sede de demostración', owner: 'Comunidad CampusLink',
    description: 'Trae ideas y conoce a otras personas de tu campus. Actividad ficticia para probar la inscripción.',
    facts: [{ label: 'Fecha', value: '15 de octubre de 2026' }, { label: 'Hora', value: '13:00 a 14:30' }, { label: 'Ubicación', value: 'Patio central' }],
  },
  {
    id: 'bienvenida', kind: 'activities', title: 'Bienvenida a la comunidad',
    category: 'Oficial', badge: 'Oficial', highlight: '20 oct · 10:00',
    subtitle: 'Auditorio · Sede de demostración', owner: 'Equipo de vida estudiantil',
    description: 'Conoce los espacios y las iniciativas de la comunidad en este evento oficial de demostración.',
    facts: [{ label: 'Fecha', value: '20 de octubre de 2026' }, { label: 'Hora', value: '10:00 a 11:00' }, { label: 'Ubicación', value: 'Auditorio' }],
  },
];

export function filterCatalog(kind: ContentKind, query: string, category: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return catalog.filter((item) => item.kind === kind &&
    (category === 'Todas' || item.category === category) &&
    normalize(`${item.title} ${item.subtitle} ${item.category}`).includes(normalize(query.trim())));
}
