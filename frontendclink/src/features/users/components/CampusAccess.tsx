
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, Switch, Text, TouchableOpacity, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { Link } from 'expo-router';
import { ArrowLeft, BadgeCheck, CalendarDays, CheckCheck, ChevronDown, ChevronRight, ChevronUp, CircleCheck, CircleMinus, GraduationCap, KeyRound, Mail, MapPinned, Minus, Plus, Save, ShieldCheck, TriangleAlert, UserRound, UsersRound, type LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshScrollView } from '@/components/RefreshScrollView';
import { Pagination } from '@/components/Pagination';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import { safeAreaInset } from '@/lib/layout/safeArea';
import { accessLabels } from '../types/access';
import type { UserAccess } from '../types/access';
import { useCampusAccess } from '../hooks/useCampusAccess';
import { accessStyles as s, accessColors as c } from './access.styles';
import { CampusAccessFilters, CampusAccessFilterSummary } from './CampusAccessFilters';

type AccessState = ReturnType<typeof useCampusAccess>;
const label = (name: string) => accessLabels[name] ?? name;
// RNWeb distingue el pulgar activo; en nativo se usa thumbColor.
const webSwitchColors = Platform.OS === 'web' ? { activeThumbColor: c.surface } : {};
const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es-CL') || '?';
const optionDescriptions: Record<string, string> = {
  ADMINISTRADOR: 'Administra cuentas y accesos en este campus.',
  USUARIO_AUTORIZADO: 'Habilita el uso de los permisos independientes asignados.',
  PUBLICAR_EVENTO: 'Permite publicar actividades oficiales en este campus.',
  ACCEDER_ANALITICA: 'Permite consultar las funciones de analítica.',
  ACCEDER_REPORTERIA: 'Permite consultar las funciones de reportería.',
};

function Icon({ icon: Component, size = 20, color = c.PRIMARY }: { icon: LucideIcon; size?: number; color?: string }) {
  return <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.icon}>
    <Component size={size} color={color} strokeWidth={1.8} />
  </View>;
}

function AccountBadge({ state }: { state: string }) {
  const active = state === 'ACTIVA', suspended = state === 'SUSPENDIDA';
  const color = active ? '#265640' : suspended ? '#755010' : '#5C6873';
  return <View style={[s.badge, { backgroundColor: active ? '#E7F3EC' : suspended ? '#FFF0CB' : '#EFF2F4', borderColor: active ? '#B5D6C2' : suspended ? '#E4C786' : '#CFD8DF' }]}>
    <Icon icon={active ? CircleCheck : CircleMinus} size={12} color={color} />
    <Text style={[s.badgeText, { color }]}>{active ? 'Activa' : suspended ? 'Suspendida' : state === 'DESACTIVADA' ? 'Desactivada' : state}</Text>
  </View>;
}

/** Administración por campus; el servidor conserva catálogo, autorización y versionado. */
export function CampusAccessScreen() {
  const access = useCampusAccess();
  const { campuses, campusId, search, applyFilters, page, setPage, users, totalPages, selected, loading, error, retry, refresh } = access;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const insets = useSafeAreaInsets();
  const campusName = campuses.find(row => row.id === campusId)?.name ?? 'Campus';
  useEffect(() => { if (!campuses.length) setFiltersOpen(false); }, [campuses.length]);
  const changePage = (next: number) => {
    if (loading || !Number.isSafeInteger(next) || next < 1 || next > totalPages || next === page) return;
    scroll.current?.scrollTo({ y: 0, animated: false }); setPage(next);
  };
  const open = async (userId: string) => {
    setOpeningId(userId);
    try { await access.selectUser(userId); } finally { setOpeningId(null); }
  };
  return <View style={s.screen}>
    <RefreshScrollView ref={scroll} style={s.scroll} onRefresh={refresh} refreshing={loading} refreshEnabled={!loading && !selected && !filtersOpen}
      refreshLabel="las cuentas y accesos" indicatorColor={c.PRIMARY} refreshIndicatorOffset={insets.top + 8}
      contentContainerStyle={[s.scrollContent, {
        paddingTop: safeAreaInset('top', insets.top, { offset: 12 }), paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 24, base: 16 }),
        paddingLeft: safeAreaInset('left', insets.left, { min: 16 }), paddingRight: safeAreaInset('right', insets.right, { min: 16 }),
      }]}>
      <View style={s.content}>
        <View style={s.navigation}>
          <Link href="/profile" asChild><TouchableOpacity accessibilityRole="link" activeOpacity={0.65} style={s.back}>
            <Icon icon={ArrowLeft} size={19} /><Text style={s.backText}>Mi perfil</Text>
          </TouchableOpacity></Link><Text style={s.eyebrow}>ADMINISTRACIÓN</Text>
        </View>
        <View style={s.heading}><Text accessibilityRole="header" style={s.title}>Cuentas y accesos</Text><Text style={s.description}>Gestiona las cuentas, los roles y los permisos de tus campus.</Text></View>
        <View style={s.listHeading}>
          <View style={s.sectionHeading}><Text accessibilityRole="header" style={s.sectionTitle}>Cuentas del campus</Text><Text style={s.pageLabel}>Página {page}</Text></View>
          {!!campuses.length && <View style={s.recordFilterRow}>
            <View style={s.recordFilterSummary}><CampusAccessFilterSummary campuses={campuses} campusId={campusId} search={search} /></View>
            <CampusAccessFilters campuses={campuses} campusId={campusId} search={search} visible={filtersOpen} setVisible={setFiltersOpen} disabled={loading}
              onChange={(id, query) => { scroll.current?.scrollTo({ y: 0, animated: false }); applyFilters(id, query); }} />
          </View>}
        </View>
        {!!error && !selected && <Message error text={error} retry={retry} />}
        {loading && !users.length && <AccountsSkeleton />}
        {loading && !!users.length && !openingId && !selected && <ActivityIndicator accessibilityLabel="Recargando accesos" color={c.PRIMARY} />}
        {!loading && !error && !campuses.length && <Empty noCampus />}
        {!loading && !error && !!campusId && !users.length && <Empty filtered={!!search} />}
        {!!users.length && <View style={s.list}>
          {users.map(user => <TouchableOpacity key={user.userId} accessibilityRole="button"
            accessibilityLabel={`Administrar accesos de ${user.fullName}`} accessibilityState={{ disabled: loading, busy: loading && openingId === user.userId }}
            disabled={loading} activeOpacity={0.7} style={s.userCard} onPress={() => void open(user.userId)}>
            <View style={s.userRow}>
              <View style={s.avatar}><Text style={s.initials}>{initials(user.fullName)}</Text></View>
              <View style={s.userCopy}><Text style={s.userName}>{user.fullName}</Text><Text style={s.fieldLabel}>{user.userId === access.auth.identity?.userId ? 'Tu cuenta' : 'Cuenta del campus'}</Text></View>
              {openingId === user.userId && loading ? <ActivityIndicator size="small" color={c.PRIMARY} /> : <Icon icon={ChevronRight} size={18} />}
            </View>
            <View style={s.userFooter}><AccountBadge state={user.accountState} /><View style={s.inline}><Icon icon={KeyRound} size={13} /><Text style={s.detailLink}>Administrar accesos</Text></View></View>
          </TouchableOpacity>)}
        </View>}
        {!loading && !error && !!campusId && users.length > 0 && <View style={s.pagination}>
          <Pagination page={page} totalPages={totalPages} onPageChange={changePage} label="Páginas de cuentas y accesos" />
        </View>}
      </View>
    </RefreshScrollView>
    {selected && <AccessEditor key={selected.userId} access={access} campusName={campusName} />}
  </View>;
}

function AccessEditor({ access, campusName }: { access: AccessState; campusName: string }) {
  const { selected, catalog, roleIds, permissionIds, saving, accountAction, setAccountAction, error, notice, cancel } = access;
  const [discard, setDiscard] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  useEffect(() => {
    if (notice || error) scroll.current?.scrollTo({ y: 0, animated: true });
  }, [notice, error]);
  if (!selected) return null;
  const changes = (['roles', 'permissions'] as const).flatMap(kind => {
    const ids = kind === 'roles' ? roleIds : permissionIds;
    const original = selected[kind].map(row => row.catalog_id);
    return [...ids.filter(id => !original.includes(id)).map(id => ({ id, added: true, name: catalog?.[kind].find(row => row.id === id)?.nombre ?? id })),
      ...selected[kind].filter(row => !ids.includes(row.catalog_id)).map(row => ({ id: row.catalog_id, added: false, name: row.nombre }))];
  });
  const close = () => {
    if (saving) return;
    if (changes.length || accountAction) { setDiscard(true); scroll.current?.scrollTo({ y: 0, animated: true }); }
    else cancel();
  };
  const blocked = saving || !!accountAction || discard;
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
    <View style={s.screen}>
      <View style={[s.detailHeader, { paddingTop: safeAreaInset('top', insets.top), paddingLeft: safeAreaInset('left', insets.left, { min: 16 }), paddingRight: safeAreaInset('right', insets.right, { min: 16 }) }]}>
        <View style={s.detailHeaderContent}><Icon icon={UsersRound} size={19} /><Text style={s.detailHeaderTitle}>Administrar cuenta</Text>
        </View>
      </View>
      <ScrollView ref={scroll} style={s.scroll} contentContainerStyle={[s.detailScrollContent, { paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 24, base: 16 }), paddingLeft: safeAreaInset('left', insets.left, { min: 16 }), paddingRight: safeAreaInset('right', insets.right, { min: 16 }) }]}>
        <View style={s.detailContent}>
          {discard && <View style={[s.message, s.warning]} accessibilityRole="alert">
            <Text style={s.changesTitle}>¿Salir sin guardar?</Text><Text style={s.warningText}>Los cambios de accesos y la acción pendiente se descartarán.</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Seguir editando" style={s.button} onPress={() => setDiscard(false)}><Text style={s.buttonText}>Seguir editando</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Descartar y salir" style={[s.button, s.secondaryButton]} onPress={cancel}><Text style={[s.buttonText, s.secondaryButtonText]}>Descartar y salir</Text></TouchableOpacity>
          </View>}
          {!!error && <Message error text={error} retry={saving ? undefined : access.retry} />}
          {!!notice && <Message text={notice} />}
          <View style={s.hero}>
            <View style={[s.userRow, width < 360 && s.heroRowNarrow]}><View style={s.heroAvatar}><Icon icon={UserRound} size={26} /></View><View style={[s.userCopy, width < 360 && s.heroCopyNarrow]}>
              <Text accessibilityRole="header" style={s.heroName}>{selected.fullName}</Text>{selected.userId === access.auth.identity?.userId && <Text style={s.fieldLabel}>Estás administrando tu cuenta</Text>}
            </View></View>
            <View style={s.chips}><AccountBadge state={selected.accountState} />
              {selected.roles.map(role => <View key={role.id} style={[s.chip, { backgroundColor: role.nombre === 'ADMINISTRADOR' ? '#E7DAF5' : '#F8E3AE' }]}><Text style={[s.chipText, { color: role.nombre === 'ADMINISTRADOR' ? '#4A2B75' : '#5B3E05' }]}>{label(role.nombre)}</Text></View>)}
            </View>
            <View style={s.identityMeta}><View style={s.inline}><Icon icon={MapPinned} size={15} color={c.muted} /><Text style={s.identityCampus}>{campusName}</Text></View><Text selectable style={s.referenceId}>ID: {selected.userId}</Text></View>
          </View>
          <AccountInformation account={selected} wide={wide} />
          <View style={s.heading}><Text accessibilityRole="header" style={s.sectionTitle}>Accesos en este campus</Text><Text style={s.description}>Asigna roles y permisos por separado. Los cambios se aplican al guardar.</Text></View>
          <View style={[s.groups, wide && s.groupsWide]}>
            {(['roles', 'permissions'] as const).map(kind => <View key={kind} style={[s.group, wide && s.groupWide]}><AssignmentChoices access={access} kind={kind} blocked={blocked} /></View>)}
          </View>
          <View style={s.saveSection}>
            {changes.length > 0 && <View style={s.changes}>
              <Text accessibilityRole="header" style={s.changesTitle}>{changes.length === 1 ? '1 cambio sin guardar' : `${changes.length} cambios sin guardar`}</Text>
              {changes.map(change => <View key={`${change.added}-${change.id}`} style={s.changeRow}><Icon icon={change.added ? Plus : Minus} size={15} color="#6F4C10" /><Text style={s.changeText}>{change.added ? 'Asignar' : 'Revocar'}: {label(change.name)}</Text></View>)}
            </View>}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Guardar accesos" accessibilityState={{ disabled: blocked || !!error || !changes.length, busy: saving && !accountAction }} disabled={blocked || !!error || !changes.length}
              style={[s.button, (blocked || !!error || !changes.length) && s.disabled]} onPress={() => void access.save()}>
              {saving && !accountAction ? <ActivityIndicator size="small" color={c.surface} /> : <Icon icon={Save} size={18} color={c.surface} />}<Text style={s.buttonText}>{saving && !accountAction ? 'Guardando…' : 'Guardar accesos'}</Text>
            </TouchableOpacity>
          </View>
          <AccountActions access={access} open={accountOpen} setOpen={setAccountOpen} blocked={blocked} dirty={!!changes.length} discard={discard} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver al listado de cuentas" accessibilityState={{ disabled: saving }} disabled={saving} style={[s.footerButton, saving && s.disabled]} onPress={close}><Text style={s.footerText}>Volver al listado de cuentas</Text></TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  </Modal>;
}

function AccountInformation({ account, wide }: { account: UserAccess; wide: boolean }) {
  const registration = account.registeredAt ? new Date(account.registeredAt) : null;
  const registeredDate = registration && Number.isFinite(registration.getTime())
    ? registration.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Fecha no disponible';
  return <View style={s.panel}>
    <View style={s.panelHeader}><Text accessibilityRole="header" style={s.sectionTitle}>Información de la cuenta</Text></View>
    <View style={[s.accountInfoGrid, wide && s.accountInfoWide]}>
      <View style={[s.accountInfoField, wide && s.accountInfoFieldWide]}><Icon icon={Mail} size={18} color={c.muted} /><View style={s.accountInfoCopy}>
        <Text style={s.fieldLabel}>Correo electrónico</Text><Text selectable style={s.accountInfoValue}>{account.email?.trim() || 'Correo no disponible'}</Text>
      </View></View>
      <View style={[s.accountInfoField, wide && s.accountInfoFieldWide]}><Icon icon={CalendarDays} size={18} color={c.muted} /><View style={s.accountInfoCopy}>
        <Text style={s.fieldLabel}>Fecha de registro</Text><Text selectable style={s.accountInfoValue}>{registeredDate}</Text>
      </View></View>
      <View style={[s.accountInfoField, s.accountInfoFieldFull]}><Icon icon={GraduationCap} size={18} color={c.muted} /><View style={s.accountInfoCopy}>
        <Text style={s.fieldLabel}>Carreras asociadas</Text>
        {account.careers?.length ? <View style={s.chips}>{account.careers.map(career => <View key={career.id} style={s.chip}><Text selectable style={s.chipText}>{career.name}</Text></View>)}</View>
          : <Text style={s.accountInfoValue}>{account.careers ? 'Sin carreras asociadas' : 'Carreras no disponibles'}</Text>}
      </View></View>
    </View>
  </View>;
}

function AssignmentChoices({ access, kind, blocked }: { access: AccessState; kind: 'roles' | 'permissions'; blocked: boolean }) {
  const { catalog, selected } = access;
  const ids = kind === 'roles' ? access.roleIds : access.permissionIds;
  const setIds = kind === 'roles' ? access.setRoleIds : access.setPermissionIds;
  const roles = kind === 'roles';
  const legacy = selected?.[kind].filter(row => !catalog?.[kind].some(option => option.id === row.catalog_id)) ?? [];
  return <View style={s.panel}>
    <View style={s.panelHeader}><View style={s.assignmentHeading}><View style={[s.inline, s.assignmentTitle]}><Icon icon={roles ? BadgeCheck : KeyRound} size={18} /><Text accessibilityRole="header" style={s.sectionTitle}>{roles ? 'Roles' : 'Permisos independientes'}</Text></View><Text style={s.count}>{ids.length}</Text></View>
      <Text style={s.fieldLabel}>{roles ? 'Define el rol de la cuenta en este campus.' : 'Selecciona cada permiso de forma individual. Requieren el rol Usuario autorizado.'}</Text>
    </View>
    {catalog?.[kind].map(row => <View key={row.id} style={[s.choice, ids.includes(row.id) && s.choiceSelected]}>
      <View style={s.choiceCopy}><Text style={s.choiceName}>{label(row.nombre)}</Text>{!!optionDescriptions[row.nombre] && <Text style={s.fieldLabel}>{optionDescriptions[row.nombre]}</Text>}</View>
      <Switch {...webSwitchColors} accessibilityLabel={label(row.nombre)} hitSlop={10} disabled={blocked} value={ids.includes(row.id)} onValueChange={() => setIds(access.toggle(ids, row.id))}
        trackColor={{ false: '#C6D3DE', true: c.PRIMARY }} thumbColor={c.surface} ios_backgroundColor="#C6D3DE" />
    </View>)}
    {!catalog?.[kind].length && <View style={s.choice}><Text style={s.fieldLabel}>{roles ? 'No hay roles disponibles.' : 'No hay permisos disponibles.'}</Text></View>}
    {legacy.map(row => <View key={row.id} style={s.legacy}><Text style={s.choiceName}>{label(row.nombre)}</Text><Text style={s.fieldLabel}>Asignación existente. Se conserva al guardar.</Text></View>)}
  </View>;
}

function AccountActions({ access, open, setOpen, blocked, dirty, discard }: { access: AccessState; open: boolean; setOpen: (value: boolean) => void; blocked: boolean; dirty: boolean; discard: boolean }) {
  const { selected, saving, accountAction, setAccountAction, error } = access;
  if (!selected) return null;
  return <View style={s.panel}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Estado de la cuenta" accessibilityState={{ expanded: open, disabled: saving || !!accountAction }} disabled={saving || !!accountAction}
      activeOpacity={0.7} style={s.accountToggle} onPress={() => setOpen(!open)}>
      <Icon icon={ShieldCheck} size={19} /><View style={s.userCopy}><Text style={s.sectionTitle}>Estado de la cuenta</Text><Text style={s.fieldLabel}>Suspensión y desactivación</Text></View><Icon icon={open ? ChevronUp : ChevronDown} size={18} />
    </TouchableOpacity>
    {open && <View style={s.accountBody}>
      {accountAction ? <View style={[s.message, s.warning]}>
        <View style={s.inline}><Icon icon={TriangleAlert} color="#6F4C10" size={18} /><Text accessibilityRole="header" style={s.changesTitle}>{accountAction === 'SUSPENDIDA' ? 'Confirmar suspensión' : 'Confirmar desactivación'}</Text></View>
        <Text style={s.warningText}>{accountAction === 'SUSPENDIDA' ? `${selected.fullName} perderá acceso a las operaciones protegidas, incluso con una sesión iniciada.`
          : `${selected.fullName} perderá acceso y se retirarán sus publicaciones físicas activas de todos los campus. Se conservarán su historial y los recursos digitales adquiridos por otras personas.`}</Text>
        <Text style={s.warningText}>Los roles y permisos guardados se conservarán.</Text>
        {dirty && <Text style={s.warningText}>Los cambios de accesos sin guardar se descartarán al confirmar esta acción.</Text>}
        {selected.userId === access.auth.identity?.userId && <Text style={[s.changesTitle, s.dangerText]}>Estás actuando sobre tu propia cuenta y perderás tu acceso.</Text>}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={accountAction === 'SUSPENDIDA' ? 'Confirmar suspensión' : 'Confirmar desactivación'} accessibilityState={{ disabled: saving || !!error || discard, busy: saving }} disabled={saving || !!error || discard}
          style={[s.button, s.dangerButton, (saving || !!error || discard) && s.disabled]} onPress={() => void access.confirmAccountAction()}>
          {saving && <ActivityIndicator size="small" color={c.surface} />}<Text style={s.buttonText}>{saving ? 'Aplicando…' : accountAction === 'SUSPENDIDA' ? 'Confirmar suspensión' : 'Confirmar desactivación'}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancelar acción" disabled={saving} style={[s.button, s.secondaryButton, saving && s.disabled]} onPress={() => setAccountAction(null)}><Text style={[s.buttonText, s.secondaryButtonText]}>Cancelar acción</Text></TouchableOpacity>
      </View> : <>
        <Text style={s.description}>Estas acciones afectan el acceso de la cuenta en toda la aplicación. Revisa sus consecuencias antes de confirmar.</Text>
        <View style={s.accountActions}>
          {selected.accountState === 'ACTIVA' && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Suspender cuenta" disabled={blocked || !!error} style={[s.button, s.secondaryButton, (blocked || !!error) && s.disabled]} onPress={() => { access.setNotice(''); setAccountAction('SUSPENDIDA'); }}><Icon icon={CircleMinus} size={18} /><Text style={[s.buttonText, s.secondaryButtonText]}>Suspender cuenta</Text></TouchableOpacity>}
          {selected.accountState !== 'DESACTIVADA' && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Desactivar cuenta" disabled={blocked || !!error} style={[s.button, s.secondaryButton, s.dangerOutline, (blocked || !!error) && s.disabled]} onPress={() => { access.setNotice(''); setAccountAction('DESACTIVADA'); }}><Icon icon={CircleMinus} size={18} color={c.danger} /><Text style={[s.buttonText, s.dangerText]}>Desactivar cuenta</Text></TouchableOpacity>}
          {selected.accountState === 'DESACTIVADA' && <Text style={s.fieldLabel}>Esta cuenta está desactivada.</Text>}
        </View>
      </>}
    </View>}
  </View>;
}

function Message({ text, error, retry }: { text: string; error?: boolean; retry?: () => void }) {
  return <View accessibilityRole="alert" style={[s.message, error && s.error]}><View style={s.messageRow}><Icon icon={error ? TriangleAlert : CheckCheck} size={18} color={error ? '#843720' : '#265640'} /><Text style={[s.messageText, error && s.errorText]}>{text}</Text></View>
    {retry && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Recargar accesos" style={[s.button, s.secondaryButton]} onPress={retry}><Text style={[s.buttonText, s.secondaryButtonText]}>Recargar accesos</Text></TouchableOpacity>}
  </View>;
}

function Empty({ noCampus = false, filtered = false }: { noCampus?: boolean; filtered?: boolean }) {
  return <View style={s.empty}><View style={s.emptyIcon}><Icon icon={noCampus ? MapPinned : UsersRound} size={27} /></View><Text accessibilityRole="header" style={s.emptyTitle}>{noCampus ? 'Sin campus para administrar' : filtered ? 'No encontramos cuentas' : 'No hay cuentas en esta página'}</Text>
    <Text style={s.emptyText}>{noCampus ? 'Aquí aparecerán los campus activos en los que tengas acceso de administración.' : filtered ? 'Prueba con otro nombre o correo, o cambia el campus en los filtros.' : 'Las cuentas de este campus aparecerán aquí cuando estén disponibles.'}</Text></View>;
}

function AccountsSkeleton() {
  return <Skeleton label="Cargando cuentas y accesos" contentStyle={s.skeleton}>{[0, 1, 2].map(key => <View key={key} style={s.skeletonCard}>
    <View style={s.userRow}><SkeletonBlock width={44} height={44} borderRadius={15} /><View style={s.userCopy}><SkeletonBlock width="72%" height={17} /><SkeletonBlock width="45%" height={12} /></View></View>
    <View style={s.userFooter}><SkeletonBlock width={75} height={24} /><SkeletonBlock width={110} height={12} /></View>
  </View>)}</Skeleton>;
}
