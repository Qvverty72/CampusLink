import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

let client: SupabaseClient | undefined;

/** Crea una sola instancia con persistencia nativa y acepta únicamente una clave pública. */
export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
    || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  // Permite abrir la vista previa cuando aún no se configuró autenticación.
  if (!url || !key) return null;
  if (key.startsWith('sb_secret_')) throw new Error('Expo requires a Supabase public key');
  if (!key.startsWith('sb_publishable_')) {
    try {
      const claims = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (claims.role !== 'anon') throw new Error();
    } catch {
      throw new Error('Expo requires a Supabase publishable or legacy anon key');
    }
  }
  client = createClient(url, key, {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  });
  return client;
}
