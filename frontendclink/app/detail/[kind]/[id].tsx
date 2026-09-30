import { useLocalSearchParams } from 'expo-router';
import { DetailScreen } from '@/screens/DetailScreen';
export default function DetailRoute() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  return <DetailScreen key={`${kind}/${id}`} kind={kind} id={id} />;
}
