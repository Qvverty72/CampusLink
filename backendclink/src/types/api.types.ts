import type { ApiErrorBody, ApiSuccessBody } from './api.js';

export type ApiSuccess<T> = ApiSuccessBody<T>;
export type ApiErrorResponse = ApiErrorBody;
export type DependencyStatus = 'ok' | 'error';
export interface DependencyChecks { supabase: DependencyStatus; mongodb?: DependencyStatus }
export type ModuleName = 'analytics' | 'auth' | 'maps' | 'elibrary' | 'physicalgoods' | 'reports' | 'users';
export interface ModuleHealth<M extends ModuleName = ModuleName> {
  module: M;
  status: 'ok' | 'unavailable';
  dependencies: DependencyChecks;
}
export interface ApiReadiness { status: 'ok' | 'unavailable'; modules: ModuleHealth[] }
