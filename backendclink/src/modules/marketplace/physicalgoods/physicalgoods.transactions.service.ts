import { ApiError } from '../../../services/api-response.js';
import { requireCampusCapability } from '../../auth/auth.authorization.js';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';
import { lockPhysicalgoodsPublisher, withPhysicalgoodsTransaction } from './physicalgoods.repository.js';
import { parsePhysicalgoodsEmptyAction, physicalgoodsId } from './physicalgoods.validation.js';
import { touchPhysicalgoods } from './physicalgoods.images.repository.js';
import { auditPhysicalgoods, physicalgoodsSnapshot } from './physicalgoods.history.repository.js';
import { closePendingPhysicalgoodsRequests, updatePhysicalgoodsRequestStatus } from './physicalgoods.requests.repository.js';
import { findPhysicalgoodsTransaction, insertPhysicalgoodsConfirmation, lockPhysicalgoodsTransactionResource,
  physicalgoodsConfirmations, setPhysicalgoodsPublicationStatus, updatePhysicalgoodsTransactionStatus } from './physicalgoods.transactions.repository.js';

/** Base del ciclo de F2.4-08: aplica aquí los efectos sobre la reserva y las solicitudes de F2.4-07. */
export async function transitionPhysicalgoodsTransaction(auth: VerifiedAuthConnection, publicationId: unknown, transactionId: unknown, body: unknown, action: 'CONFIRMAR'|'CANCELAR') {
  requireCampusCapability(auth,auth.campusId,'general');
  const id = physicalgoodsId(publicationId,'publicationId'), selected = physicalgoodsId(transactionId,'transactionId');
  parsePhysicalgoodsEmptyAction(body);
  try {
    return await withPhysicalgoodsTransaction(async client => {
      const { profile,roles } = await lockPhysicalgoodsPublisher(client,auth.userId);
      if (!profile || profile.campus_id !== auth.campusId || profile.institucion_id !== auth.profile.institucion_id) throw new ApiError(409,'CONFLICT','Tu contexto cambió. Recarga el acuerdo.');
      const current = { ...auth,profile,roles,campusId:profile.campus_id };
      requireCampusCapability(current,current.campusId,'general');
      const resource = await lockPhysicalgoodsTransactionResource(client,id,current.campusId);
      if (!resource) throw new ApiError(404,'NOT_FOUND','No se encontró el acuerdo en tu campus.');
      const transaction = await findPhysicalgoodsTransaction(client,id,selected);
      if (!transaction || ![transaction.propietario_id,transaction.receptor_id].includes(current.userId)) throw new ApiError(404,'NOT_FOUND','No se encontró un acuerdo propio.');
      const confirmations = await physicalgoodsConfirmations(client,selected);
      if (action === 'CONFIRMAR' && transaction.estado_transaccion === 'COMPLETADA') return { id:selected,status:transaction.estado_transaccion };
      if (action === 'CANCELAR' && transaction.estado_transaccion === 'CANCELADA') return { id:selected,status:transaction.estado_transaccion };
      if (!['RESERVADA','PENDIENTE_CONFIRMACION'].includes(transaction.estado_transaccion)) throw new ApiError(409,'CONFLICT','El acuerdo ya fue cerrado.');
      const before = await physicalgoodsSnapshot(client,id);
      let status:'PENDIENTE_CONFIRMACION'|'COMPLETADA'|'CANCELADA';
      if (action === 'CANCELAR') {
        status='CANCELADA';
        await updatePhysicalgoodsRequestStatus(client,transaction.solicitud_id,'CANCELADA');
      } else {
        const role = transaction.propietario_id===current.userId ? 'PROPIETARIO' : 'RECEPTOR';
        if (!confirmations.some(row => row.usuario_id===current.userId && row.rol_confirmante===role)) {
          await insertPhysicalgoodsConfirmation(client,selected,current.userId,role);
          confirmations.push({ usuario_id:current.userId,rol_confirmante:role });
        }
        const both = confirmations.some(row => row.usuario_id===transaction.propietario_id && row.rol_confirmante==='PROPIETARIO')
          && confirmations.some(row => row.usuario_id===transaction.receptor_id && row.rol_confirmante==='RECEPTOR');
        status=both ? 'COMPLETADA' : 'PENDIENTE_CONFIRMACION';
        if (both) await closePendingPhysicalgoodsRequests(client,id);
      }
      await updatePhysicalgoodsTransactionStatus(client,selected,status,current.userId);
      // Preserva deleted_at y estados de moderación: cerrar un acuerdo no republica una retirada.
      if (status !== 'PENDIENTE_CONFIRMACION' && resource.estado_publicacion==='RESERVADO') {
        await setPhysicalgoodsPublicationStatus(client,id,status==='COMPLETADA'?'FINALIZADO':'DISPONIBLE');
        await touchPhysicalgoods(client,id);
        await auditPhysicalgoods(client,current,id,'EDITAR_PUBLICACION',before,await physicalgoodsSnapshot(client,id));
      }
      return { id:selected,status };
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudo actualizar el acuerdo.');
  }
}
