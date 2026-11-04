import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { PhysicalgoodsHistoryDetail } from '@/features/marketplace/physicalgoods/components/PhysicalgoodsHistory';
import { PhysicalgoodsRequestProduct } from '@/features/marketplace/physicalgoods/components/PhysicalgoodsRequestProduct';
import { usePhysicalgoodsHistoryDetail } from '@/features/marketplace/physicalgoods/hooks/usePhysicalgoodsHistory';
import { PhysicalgoodsTransaction } from '@/features/marketplace/physicalgoods/components/PhysicalgoodsTransaction';
import { DigitalResourceModal } from '@/features/marketplace/elibrary/components/DigitalActivityResource';
import { DigitalTransactionModal } from '@/features/marketplace/elibrary/components/DigitalActivityTransactions';
import { DigitalReceivedRequests } from '@/features/marketplace/elibrary/components/DigitalActivityRequests';
import { loadDigitalActivityResource } from '@/features/marketplace/elibrary/api/digitalActivityApi';
import type { DigitalPublication } from '@/features/marketplace/elibrary/types/publication';
import { loadDigitalTrade } from '@/features/marketplace/elibrary/api/digitalTradesApi';
import type { DigitalTrade } from '@/features/marketplace/elibrary/types/trade';
import { AgreementStepModal } from '@/features/marketplace/components/AgreementStepModal';
import { RequestButton } from '@/features/marketplace/components/RequestsUI';
import { AgreementPanelSkeleton } from '@/features/marketplace/components/AgreementUI';
import { ui } from '@/features/marketplace/components/CatalogUI';
import type { ResourceNotification } from '../types/notification';

/** Los destinos vuelven a autorizarse en sus APIs; el aviso no concede acceso al recurso. */
export function NotificationResourceModal({ item, onClose, onChanged }: {
  item: ResourceNotification; onClose: () => void; onChanged: () => void;
}) {
  const [transactionId, setTransactionId] = useState('transactionId' in item ? item.transactionId : null);
  const [acquired, setAcquired] = useState(false);
  if (item.resourceType === 'FISICO') {
    if (transactionId) return <PhysicalgoodsTransaction target={{ publicationId: item.publicationId, transactionId }}
      initialPanel={item.type === 'COORDINACION_RECURSO' ? 'coordinate' : undefined}
      onClose={onClose} onChanged={onChanged} />;
    if (item.type === 'RESOURCE_UPDATED') return <PhysicalUpdatedResource publicationId={item.publicationId} requestId={item.requestId} onClose={onClose} />;
    return <PhysicalgoodsHistoryDetail target={{ publicationId: item.publicationId, ...('requestId' in item ? { requestId: item.requestId } : {}) }}
      onClose={onClose} onAgreement={(_id, id) => setTransactionId(id)} />;
  }
  if (item.type === 'RESOURCE_REQUEST_RECEIVED') return <DigitalNotificationRequests publicationId={item.publicationId} onClose={onClose} onChanged={onChanged} />;
  if (acquired || !transactionId) return <DigitalResourceModal id={item.publicationId} title="Recurso del aviso"
    mode={acquired ? 'acquired' : 'resource'} onClose={onClose} />;
  return <DigitalNotificationTransaction publicationId={item.publicationId} transactionId={transactionId}
    initialPanel={item.type === 'COORDINACION_RECURSO' ? 'coordinate' : 'confirm'} onClose={onClose} onAcquired={() => setAcquired(true)} />;
}

function PhysicalUpdatedResource({publicationId,requestId,onClose}:{publicationId:string;requestId:string;onClose:()=>void}) {
  const state=usePhysicalgoodsHistoryDetail({publicationId,requestId});
  if (state.detail && 'publication' in state.detail) return <PhysicalgoodsRequestProduct request={state.detail} onClose={onClose} />;
  return <AgreementStepModal title="Recurso actualizado" closeLabel="Cerrar recurso" onClose={onClose}>
    {state.error ? <><Text accessibilityRole="alert" style={ui.subtitle}>{state.error}</Text><RequestButton label="Reintentar" onPress={state.reload} /></>
      : <AgreementPanelSkeleton panel="accepted" />}
  </AgreementStepModal>;
}

function DigitalNotificationRequests({publicationId,onClose,onChanged}:{publicationId:string;onClose:()=>void;onChanged:()=>void}) {
  const [resource,setResource]=useState<DigitalPublication|null>(null),[error,setError]=useState(false),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();setError(false);
    void loadDigitalActivityResource(publicationId,abort.signal).then(value=>{if(!abort.signal.aborted)setResource(value);})
      .catch(()=>{if(!abort.signal.aborted)setError(true);});
    return()=>abort.abort();
  },[publicationId,revision]);
  if (resource) return <DigitalReceivedRequests resource={{publicationId:resource.id,title:resource.title,campusName:resource.campusName,
    modality:resource.modality,amount:resource.price,total:0,pending:0,active:0,completed:0,publishedAt:resource.publishedAt??resource.updatedAt}}
    onClose={onClose} onResolved={onChanged} onUncertain={onChanged} />;
  return <AgreementStepModal title="Solicitudes del recurso" closeLabel="Cerrar solicitudes" onClose={onClose}>
    {error ? <><Text accessibilityRole="alert" style={ui.subtitle}>No se pudieron consultar las solicitudes de este recurso.</Text><RequestButton label="Reintentar" onPress={()=>setRevision(value=>value+1)} /></>
      : <AgreementPanelSkeleton digital panel="accepted" />}
  </AgreementStepModal>;
}

function DigitalNotificationTransaction({ publicationId, transactionId, onClose, onAcquired, initialPanel }: {
  publicationId: string; transactionId: string; onClose: () => void; onAcquired: () => void; initialPanel: 'coordinate' | 'confirm';
}) {
  const [trade, setTrade] = useState<DigitalTrade | null>(null);
  const [error, setError] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setError(false);
    void loadDigitalTrade(publicationId, transactionId, abort.signal)
      .then(value => { if (!abort.signal.aborted) setTrade(value); })
      .catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => abort.abort();
  }, [publicationId, transactionId, revision]);
  if (trade) return <DigitalTransactionModal initial={trade} initialPanel={initialPanel} onSnapshot={setTrade}
    onClose={onClose} onAcquired={onAcquired} />;
  return <AgreementStepModal title="Transacción del recurso" closeLabel="Cerrar transacción" onClose={onClose}>
    {error ? <><Text accessibilityRole="alert" style={ui.subtitle}>No se pudo consultar esta transacción. Puede que ya no esté disponible para tu cuenta.</Text>
      <RequestButton label="Reintentar" onPress={() => setRevision(value => value + 1)} /></>
      : <AgreementPanelSkeleton digital panel="confirm" />}
  </AgreementStepModal>;
}
