import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Undefined keeps local guest development usable without Auth configuration. */
export const supabase: SupabaseClient | undefined =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : undefined

export const isSupabaseAuthConfigured = Boolean(supabase)
