/** Lenguaje de presentación. No redefine métricas, autorización ni contratos. */
export const ANALYTICS_COPY = {
  allCareers: 'Todas las carreras (incluye sin clasificar)',
  grouping: 'Ver por semana o mes',
  groupingHelp: 'Las semanas van de lunes a domingo y los meses siguen el calendario de Chile (America/Santiago).',
  savedReport: 'Reporte guardado',
  savedHelp: 'Estas cifras quedaron guardadas y no cambian al actualizar el tablero.',
  meaning: '¿Qué significa?',
  careerCleared: 'Se quitó la carrera porque no está disponible en los campus elegidos; se incluyen todas, también sin clasificar.',
  applied: 'Filtros aplicados.',
  states: {
    zero: 'No hay registros para este indicador; prueba otras fechas o campus.',
    noActivity: 'No se registraron vistas, solicitudes ni inscripciones en este período; revisa las cuentas activas o cambia las fechas.',
    unavailable: 'No hay datos disponibles para este período; elige otro para ver sus cifras.',
    error: 'No pudimos cargar las cifras; vuelve a consultar.',
    permission: 'Ya no tienes acceso a estas cifras; vuelve a Mi perfil o revisa tus permisos con tu institución.',
    generation: 'No pudimos confirmar si se guardó; revisa Reportes guardados antes de intentar otra vez.',
  },
  kpis: {
    activeUsers: { title: 'Cuentas activas', short: 'Cuentas', unit: 'cuentas', help: 'Cuentas con estado activo al cierre del período, según la auditoría disponible: no son personas conectadas ni inicios de sesión. Es un saldo y no se suma entre períodos.' },
    resourceDemand: { title: 'Recursos vistos y pedidos', short: 'Recursos', unit: 'interacciones', help: 'Suma de vistas y solicitudes de recursos durante el período; no son recursos únicos. Vistas y solicitudes se muestran por separado.' },
    subjectDemand: { title: 'Interés por asignaturas', short: 'Asignaturas', unit: 'interacciones', help: 'Vistas y solicitudes de recursos asociados a asignaturas. Un recurso puede contar en varias: los resultados por asignatura no son conjuntos exclusivos.' },
    activityParticipation: { title: 'Inscripciones a actividades', short: 'Actividades', unit: 'inscripciones', help: 'Inscripciones históricas registradas, incluidas reinscripciones y el creador según las reglas vigentes; no es asistencia presencial ni participantes actuales. Un retiro posterior no borra la inscripción histórica.' },
  },
} as const;
