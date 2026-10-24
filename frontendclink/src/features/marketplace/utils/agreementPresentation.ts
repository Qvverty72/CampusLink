import type { TransactionConfirmation } from '../types/transaction';

export const agreementCopy = {
  coordinationTitle: (title: string) => `Coordinación para la entrega de ${title}`,
  poi: 'Punto de interés', poiOptional: 'Punto de interés (opcional)', noPoi: 'Solo edificio y piso',
  closeStep: (step: string) => `Cerrar ${step.toLocaleLowerCase('es-CL')}`, messagesRefresh: 'los mensajes de coordinación',
  openStep: (label: string) => `Abrir ${label.toLocaleLowerCase('es-CL')}`, product: 'Recurso del acuerdo', closeProduct: 'Cerrar información del recurso',
  productLoading: 'Cargando información del recurso', productError: 'No se pudo cargar la información del recurso. Puedes reintentar.', productRetry: 'Reintentar información',
  productUnavailable: 'Las imágenes y la descripción de esta publicación no están disponibles para consulta en tu campus actual.',
  currentProduct: 'Imágenes y descripción actuales de la publicación. Los términos originales del acuerdo se conservan.',
  noPhotos: 'Sin fotografías disponibles', description: 'Descripción', photo: (index: number, total: number) => `Fotografía ${index} de ${total}`,
  chooseStep: 'Toca un paso para consultar el recurso, coordinar la entrega o revisar las confirmaciones.',
  selectLocation: (label: string) => `Seleccionar ${label.toLocaleLowerCase('es-CL')}`, readOnly: 'Solo consulta', donation: 'Donación', loading: 'Cargando acuerdos', you: ' · Tú', participant: 'Participante',
  viewFinished: (count: number) => `Ver finalizados (${count})`, resourceState: (campus: string, state: string) => `${campus} · Recurso ${state.toLowerCase().replaceAll('_', ' ')}`, started: (date: string) => `Iniciado: ${date}`, cancelledBy: (name: string) => `Cancelado por ${name}.`,
  cancelWithdrawn: 'Se cancelará el acuerdo y se conservará su historial. La publicación seguirá retirada.',
  cancelHidden: 'Se conservará el historial. La publicación seguirá fuera del marketplace.',
  cancelAvailable: 'El recurso volverá a estar disponible. Las otras solicitudes seguirán pendientes y podrán resolverse. Este acuerdo quedará en el historial.',
  title: 'Mis acuerdos', active: 'Activos', finished: 'Finalizados', pageScope: 'Acuerdos de esta página',
  actionGroup: 'Requiere tu acción', waitingGroup: 'Esperando a la otra persona', otherGroup: 'Consultar estado',
  emptyActive: 'No tienes acuerdos activos en esta página.', emptyFinished: 'Aún no hay acuerdos finalizados en esta página.',
  explore: 'Explorar recursos', retry: 'Reintentar acuerdos', unknown: 'Estado pendiente de consultar',
  coordinating: 'Coordinando entrega', needsConfirmation: 'Falta tu confirmación', finishedStatus: 'Finalizado', cancelled: 'Cancelado',
  waiting: (name: string) => `Esperando a ${name}`, coordinate: 'Coordina el punto de encuentro', confirm: 'Confirmar que se realizó',
  confirmNext: 'Confirma que se realizó', waitingNext: 'Esperando confirmación',
  original: 'Condiciones originales del acuerdo', acceptedStep: 'Aceptada', coordinateStep: 'Coordinar', confirmStep: 'Confirmar',
  menu: 'Opciones del acuerdo', request: 'Ver solicitud', resource: 'Ver recurso', report: 'Denunciar transacción', cancel: 'Cancelar transacción', back: 'Volver',
  cancelQuestion: '¿Cancelar esta transacción?', cancelYes: 'Sí, cancelar',
  confirmQuestion: '¿Confirmas que el intercambio se realizó?', confirmYes: 'Sí, confirmar',
  reportQuestion: '¿Denunciar esta transacción?', reportHelp: 'Podrás elegir el motivo y revisar la denuncia antes de enviarla.', reportYes: 'Continuar',
  confirmHelp: 'El acuerdo solo se completa cuando ambas partes confirman.',
  confirmationHelp: 'La transacción termina cuando ambos confirman.', confirmedSelf: 'Confirmaste', confirmedOther: 'Confirmó', pending: 'Pendiente',
  where: '¿Dónde estás?', building: 'Edificio', floor: 'Piso', location: 'Avisar mi ubicación',
  locationHelp: 'Selecciona tu ubicación para avisar a la otra persona.',
  noLocations: 'No hay edificios y pisos disponibles. Puedes continuar con las confirmaciones.',
  messages: 'Mensajes de coordinación', emptyMessages: 'Aún no hay mensajes. Cuando alguien avise su ubicación, aparecerá aquí.',
  locationRetry: 'Reintentar ubicaciones', messageRetry: 'Reintentar mensajes', locationLoading: 'Cargando ubicaciones', messagesLoading: 'Cargando mensajes de coordinación',
  saving: 'Guardando cambios del acuerdo…', history: 'Consulta histórica de otro campus. Puedes revisar el acuerdo y sus mensajes.',
  withdrawn: 'La publicación fue retirada. Se conserva este acuerdo.', lookup: 'Buscando la solicitud del acuerdo…',
  lookupError: 'No se pudo encontrar la solicitud de este acuerdo en tu historial. Puedes reintentar desde el menú.',
  partial: 'No pudimos consultar todos los detalles. Puedes abrir el acuerdo o reintentar.',
  confirmationTitle: (count: number) => `Confirmaciones · ${count} de 2`,
  initiated: (date: string) => `Iniciado el ${date}`, closed: (date: string) => `Cerrado el ${date}`,
  seller: 'Vendedor', buyer: 'Comprador', donor: 'Donante', recipient: 'Receptor',
};

export type AgreementUIState = 'COORDINANDO' | 'ESPERANDO_TU_CONFIRMACION' | 'ESPERANDO_OTRO' | 'FINALIZADO' | 'CANCELADO';
export interface AgreementPresentationInput {
  status: string; role: string; modality: string;
  owner: { id: string; fullName: string }; receiver: { id: string; fullName: string };
  confirmations: TransactionConfirmation[];
}

/** Solo presentación: cada confirmación debe corresponder al ID y rol correctos. */
export function agreementPresentation(agreement: AgreementPresentationInput) {
  const owner = agreement.role === 'PROPIETARIO';
  const own = owner ? agreement.owner : agreement.receiver, other = owner ? agreement.receiver : agreement.owner;
  const confirmed = (id: string, role: string) => agreement.confirmations.some(row => row.userId === id && row.role === role);
  const mineConfirmed = confirmed(own.id, owner ? 'PROPIETARIO' : 'RECEPTOR');
  const otherConfirmed = confirmed(other.id, owner ? 'RECEPTOR' : 'PROPIETARIO');
  const state: AgreementUIState = agreement.status === 'COMPLETADA' ? 'FINALIZADO' : agreement.status === 'CANCELADA' ? 'CANCELADO'
    : mineConfirmed ? 'ESPERANDO_OTRO' : otherConfirmed ? 'ESPERANDO_TU_CONFIRMACION' : 'COORDINANDO';
  const label = state === 'FINALIZADO' ? agreementCopy.finishedStatus : state === 'CANCELADO' ? agreementCopy.cancelled
    : state === 'ESPERANDO_OTRO' ? agreementCopy.waiting(other.fullName) : state === 'ESPERANDO_TU_CONFIRMACION' ? agreementCopy.needsConfirmation : agreementCopy.coordinating;
  const roleLabel = agreement.modality === 'DONACION' ? `${owner ? 'Donas a' : 'Recibes de'} ${other.fullName}` : `${owner ? 'Vendes a' : 'Compras a'} ${other.fullName}`;
  return { state, label, roleLabel, otherName: other.fullName, mineConfirmed, otherConfirmed,
    confirmedCount: Number(mineConfirmed) + Number(otherConfirmed), terminal: state === 'FINALIZADO' || state === 'CANCELADO',
    requiresAction: state === 'COORDINANDO' || state === 'ESPERANDO_TU_CONFIRMACION',
    next: state === 'COORDINANDO' ? agreementCopy.coordinate : state === 'ESPERANDO_TU_CONFIRMACION' ? agreementCopy.confirmNext : agreementCopy.waitingNext };
}

export type AgreementPresentation = ReturnType<typeof agreementPresentation>;
