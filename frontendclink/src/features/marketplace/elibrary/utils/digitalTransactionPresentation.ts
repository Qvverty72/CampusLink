import type { DigitalTrade } from '../types/trade';
import type { AgreementUIState } from '../../utils/agreementPresentation';
import { agreementCopy as copy } from '../../utils/agreementPresentation';

/** Presentación digital: no añade coordinación ni altera permisos del servidor. */
export function digitalTransactionPresentation(trade: DigitalTrade, viewerId?: string): {
  state?: AgreementUIState; label: string; group: 'action' | 'waiting' | 'other' | 'finished';
} {
  if (trade.status === 'COMPLETADA') return { state: 'FINALIZADO', label: copy.finishedStatus, group: 'finished' };
  if (trade.status === 'CANCELADA') return { state: 'CANCELADO', label: copy.cancelled, group: 'finished' };
  if (!['RESERVADA', 'PENDIENTE_CONFIRMACION'].includes(trade.status)) return { label: copy.unknown, group: 'other' };
  const owner = viewerId === trade.ownerId, receiver = viewerId === trade.receiverId;
  const confirmed = (owner || receiver) && trade.confirmations.some(row => row.userId === viewerId && row.role === (owner ? 'PROPIETARIO' : 'RECEPTOR'));
  if (confirmed) {
    const otherId = owner ? trade.receiverId : trade.ownerId;
    const otherName = trade.participants?.find(row => row.id === otherId)?.name ?? 'la otra persona';
    return { state: 'ESPERANDO_OTRO', label: copy.waiting(otherName), group: 'waiting' };
  }
  return { state: 'ESPERANDO_TU_CONFIRMACION', label: trade.canConfirm ? copy.needsConfirmation : copy.unknown, group: trade.canConfirm ? 'action' : 'other' };
}
