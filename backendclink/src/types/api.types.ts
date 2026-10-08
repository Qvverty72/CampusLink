export interface ApiSuccess<T> { data: T; meta?: Record<string, unknown> }
export interface ApiErrorResponse {
  error: { code: string; message: string; details?: Record<string, string> };
}
export type DependencyStatus = 'ok' | 'error';
export interface DependencyChecks { supabase: DependencyStatus; mongodb?: DependencyStatus }
export type ModuleName = 'analytics' | 'auth' | 'maps' | 'elibrary' | 'physicalgoods' | 'reports' | 'users';
export interface ModuleHealth<M extends ModuleName = ModuleName> {
  module: M;
  status: 'ok' | 'unavailable';
  dependencies: DependencyChecks;
}
export interface ApiReadiness { status: 'ok' | 'unavailable'; modules: ModuleHealth[] }
