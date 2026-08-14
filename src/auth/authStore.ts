import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase } from './supabaseClient'

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated'

export interface AuthUser {
  id: string
}

export type SignUpResult =
  | { status: 'authenticated' }
  | { status: 'confirmation-required' }
  | { status: 'error'; reason: 'duplicate-account' | 'invalid-password' | 'unavailable' }

interface AuthStore {
  status: AuthStatus
  user: AuthUser | null
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<string | undefined>
  signUp: (email: string, password: string) => Promise<SignUpResult>
  signOut: () => Promise<void>
}

let initialized = false
let unsubscribe: (() => void) | undefined
let currentAccessToken: string | null = null

function applySession(session: Session | null): Pick<AuthStore, 'status' | 'user'> {
  currentAccessToken = session?.access_token ?? null
  return session?.user
    ? { status: 'authenticated', user: { id: session.user.id } }
    : { status: 'anonymous', user: null }
}

function signUpErrorReason(message: string): Extract<SignUpResult, { status: 'error' }>['reason'] {
  const normalized = message.toLowerCase()
  if (/(already|exists|registered|duplicate)/.test(normalized)) return 'duplicate-account'
  if (/(password|weak|short)/.test(normalized)) return 'invalid-password'
  return 'unavailable'
}

export async function getAuthAccessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) {
    currentAccessToken = null
    useAuthStore.setState({ status: 'anonymous', user: null })
    return null
  }
  currentAccessToken = data.session.access_token
  return currentAccessToken
}

export const useAuthStore = create<AuthStore>((set) => ({
  status: 'loading',
  user: null,
  initialize: async () => {
    if (initialized) return
    initialized = true
    if (!supabase) {
      set({ status: 'anonymous', user: null })
      return
    }
    const { data } = await supabase.auth.getSession()
    set(applySession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session) => set(applySession(session)),
    )
    unsubscribe = () => listener.subscription.unsubscribe()
  },
  signIn: async (email, password) => {
    if (!supabase) return 'Đăng nhập chưa được cấu hình.'
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return 'Không thể đăng nhập. Vui lòng kiểm tra lại thông tin.'
    set(applySession(data.session))
    return undefined
  },
  signUp: async (email, password) => {
    if (!supabase) return { status: 'error', reason: 'unavailable' }
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { status: 'error', reason: signUpErrorReason(error.message) }
    if (data.session) {
      set(applySession(data.session))
      return { status: 'authenticated' }
    }
    return { status: 'confirmation-required' }
  },
  signOut: async () => {
    if (supabase) await supabase.auth.signOut()
    set(applySession(null))
  },
}))

export function disposeAuthStoreForTests(): void {
  unsubscribe?.()
  unsubscribe = undefined
  initialized = false
  currentAccessToken = null
}
