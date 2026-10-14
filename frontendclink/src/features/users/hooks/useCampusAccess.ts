import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadAccessCampuses, loadAccessCatalog, loadAccessUsers, loadUserAccess, saveUserAccess, saveAccountState } from '../api/accessApi';
import type { AccessCatalog, AccessUser, UserAccess, AccountStateAction } from '../types/access';

/** Coordina administración por campus, asignaciones versionadas y cambio de estado de cuenta. */
export function useCampusAccess() {
  const auth = useAuth();
  const [campuses, setCampuses] = useState<{ id: string; name: string }[]>([]);
  const [campusId, setCampusId] = useState('');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [catalog, setCatalog] = useState<AccessCatalog | null>(null);
  const [selected, setSelected] = useState<UserAccess | null>(null);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [permissionIds, setPermissionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountAction, setAccountAction] = useState<AccountStateAction | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const pending = useRef<AbortController | null>(null);
  const selectedId = useRef<string | null>(null);
  function fail(reason: unknown) {
    setError(reason instanceof AuthApiError && reason.status === 409 ? 'El usuario o sus accesos cambiaron. Recarga antes de confirmar.'
      : reason instanceof AuthApiError && reason.status === 403 ? 'Tu acceso a este campus ya no está disponible.'
      : reason instanceof AuthApiError && reason.status === 404 ? 'El usuario ya no está disponible en este campus.'
      : reason instanceof AuthApiError && reason.status === 400 ? 'Revisa la acción y los accesos seleccionados.'
      : reason instanceof AuthApiError && reason.status === 401 ? 'Tu sesión venció. Inicia sesión nuevamente.'
      : 'No se pudieron cargar o guardar los accesos. Inténtalo nuevamente.');
    if (reason instanceof AuthApiError && [401,403].includes(reason.status)) auth.refreshIdentity();
    if (reason instanceof AuthApiError && reason.status === 404) { setSelected(null); selectedId.current = null; }
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void loadAccessCampuses(controller.signal).then(rows => {
      if (controller.signal.aborted) return;
      setCampuses(rows); setCampusId(current => rows.some(row => row.id === current) ? current : rows[0]?.id ?? '');
      setLoading(false);
    }).catch(reason => { if (!controller.signal.aborted) { fail(reason); setLoading(false); } });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    if (!campusId) return;
    const controller = new AbortController();
    pending.current?.abort(); pending.current = controller;
    setLoading(true); setError(''); setSelected(null); setAccountAction(null); selectedId.current = null; setCatalog(null); setUsers([]); setNotice('');
    void Promise.all([loadAccessCatalog(campusId, controller.signal), loadAccessUsers(campusId, page, controller.signal)])
      .then(([options, result]) => {
        if (controller.signal.aborted) return;
        setCatalog(options); setUsers(result.data); setHasMore(result.meta.hasMore); setLoading(false);
      }).catch(reason => { if (!controller.signal.aborted) { fail(reason); setLoading(false); } });
    return () => controller.abort();
  }, [campusId, page, reload]);
  useEffect(() => () => { pending.current?.abort(); }, []);
  const selectUser = async (userId: string) => {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    selectedId.current = userId; setSelected(null); setAccountAction(null); setError(''); setNotice(''); setLoading(true);
    try {
      const detail = await loadUserAccess(campusId, userId, controller.signal);
      if (controller.signal.aborted) return;
      setSelected(detail); setRoleIds(detail.roles.map(row => row.catalog_id)); setPermissionIds(detail.permissions.map(row => row.catalog_id));
    } catch (reason) { if (!controller.signal.aborted) fail(reason); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  };
  const toggle = (ids: string[], id: string) => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
  const save = async () => {
    if (!selected || saving) return;
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    setSaving(true); setError(''); setNotice('');
    try {
      const detail = await saveUserAccess(campusId, selected.userId, { roleIds, permissionIds, version: selected.version }, controller.signal);
      if (controller.signal.aborted) return;
      setSelected(detail); setNotice('Accesos guardados. Se aplicarán en las próximas operaciones del usuario.');
      if (selected.userId === auth.identity?.userId) auth.refreshIdentity();
    } catch (reason) { if (!controller.signal.aborted) fail(reason); }
    finally { if (!controller.signal.aborted) setSaving(false); }
  };
  const confirmAccountAction = async () => {
    if (!selected || !accountAction || saving || error) return;
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    setSaving(true); setError(''); setNotice('');
    try {
      const detail = await saveAccountState(campusId, selected.userId, accountAction, selected.version, controller.signal);
      if (controller.signal.aborted) return;
      setSelected(detail); setAccountAction(null);
      setRoleIds(detail.roles.map(row => row.catalog_id)); setPermissionIds(detail.permissions.map(row => row.catalog_id));
      setUsers(rows => rows.map(row => row.userId === detail.userId ? { ...row, accountState: detail.accountState } : row));
      setNotice(detail.accountState === 'SUSPENDIDA' ? 'Cuenta suspendida. Ya no puede ejecutar operaciones protegidas.'
        : 'Cuenta desactivada. Sus publicaciones físicas activas fueron retiradas.');
      if (selected.userId === auth.identity?.userId) auth.refreshIdentity();
    } catch (reason) { if (!controller.signal.aborted) { setAccountAction(null); fail(reason); } }
    finally { if (!controller.signal.aborted) setSaving(false); }
  };
  const retry = () => { if (selectedId.current && campusId) void selectUser(selectedId.current); else setReload(value => value + 1); };
  const cancel = () => { setSelected(null); setAccountAction(null); selectedId.current = null; setError(''); setNotice(''); };
  return { auth, campuses, campusId, setCampusId, page, setPage, users, hasMore, catalog, selected,
    roleIds, setRoleIds, permissionIds, setPermissionIds, loading, saving, accountAction, setAccountAction,
    error, notice, setNotice, selectUser, toggle, save, confirmAccountAction, retry, cancel };
}
