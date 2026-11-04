/** Compatibilidad para imports anteriores; el motor compartido vive en src/components. */
import { useScrollRefresh } from '@/components/RefreshScrollView';
export {
  RefreshScrollView as ActivityRefreshScrollView,
  ScrollRefreshRegistration as ActivityRefreshRegistration,
  useScrollReset as useActivityScrollReset,
  useCompactScrollHeader as useActivityCompactHeader,
} from '@/components/RefreshScrollView';

export function useActivityRefresh(onRefresh: () => void, refreshing: boolean, enabled: boolean, label = 'la ficha') {
  useScrollRefresh(onRefresh, refreshing, enabled, label);
}
