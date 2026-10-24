import { useState } from 'react';
import { View } from 'react-native';
import { CatalogTabs } from '../../components/CatalogUI';
import { AcquiredDigitalResources } from './AcquiredDigitalResources';
import { OwnedDigitalResources } from './OwnedDigitalResources';
import { DigitalTradeCenter } from './DigitalTradeCenter';

/** Agrupa el acceso personal sin cambiar las acciones ni los contratos de los paneles existentes. */
export function DigitalPersonalLibrary({ initialTab = 'acquired', initialPublicationId }: { initialTab?: 'acquired' | 'owned' | 'trades'; initialPublicationId?: string } = {}) {
  const [tab, setTab] = useState<'acquired' | 'owned' | 'trades'>(initialTab);
  const [visited, setVisited] = useState({ acquired: initialTab === 'acquired', owned: initialTab === 'owned', trades: initialTab === 'trades' });
  const [receivedEntryVersion, setReceivedEntryVersion] = useState(0);
  const [acquiredEntry, setAcquiredEntry] = useState({ id: initialPublicationId, version: 0 });
  const reviewRequests = () => { setReceivedEntryVersion(value => value + 1); setVisited(previous => ({ ...previous, trades: true })); setTab('trades'); };
  const openAcquired = (id: string) => { setAcquiredEntry(previous => ({ id, version: previous.version + 1 })); setVisited(previous => ({ ...previous, acquired: true })); setTab('acquired'); };
  return <View style={{ gap: 16 }}>
    <CatalogTabs selected={tab} onSelect={value => { setTab(value); setVisited(previous => ({ ...previous, [value]: true })); }}
      tabs={[{ id: 'acquired', label: 'Adquiridos' }, { id: 'owned', label: 'Publicaciones' }, { id: 'trades', label: 'Acuerdos' }]} />
    {visited.acquired && <View style={tab !== 'acquired' && { display: 'none' }}><AcquiredDigitalResources embedded initialPublicationId={acquiredEntry.id} entryVersion={acquiredEntry.version} /></View>}
    {visited.owned && <View style={tab !== 'owned' && { display: 'none' }}><OwnedDigitalResources embedded onRequests={reviewRequests} /></View>}
    {visited.trades && <View style={tab !== 'trades' && { display: 'none' }}><DigitalTradeCenter embedded receivedEntryVersion={receivedEntryVersion} onAcquired={openAcquired} /></View>}
  </View>;
}
