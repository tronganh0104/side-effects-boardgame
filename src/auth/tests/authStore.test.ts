import { afterEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => {
  let authListener: ((event: string, session: unknown) => void) | undefined
  const subscription = { unsubscribe: vi.fn() }
  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn((listener) => {
      authListener = listener
      return { data: { subscription } }
    }),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }
  return {
    auth,
    emit: (event: string, session: unknown) => authListener?.(event, session),
    reset: () => {
      authListener = undefined
      subscription.unsubscribe.mockReset()
      Object.values(auth).forEach((method) => method.mockReset())
    },
  }
})

vi.mock('../supabaseClient', () => ({ supabase: { auth: mock.auth } }))

import {
  disposeAuthStoreForTests,
  getAuthAccessToken,
  useAuthStore,
} from '../authStore'

const session = {
  access_token: 'access-token',
  user: { id: 'user-123' },
}

describe('auth store', () => {
  afterEach(() => {
    disposeAuthStoreForTests()
    useAuthStore.setState({ status: 'loading', user: null })
    mock.reset()
  })

  it('restores a persisted Auth session once and follows later auth changes', async () => {
    mock.auth.getSession.mockResolvedValue({ data: { session } })
    await useAuthStore.getState().initialize()
    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated', user: { id: 'user-123' },
    })
    expect(mock.auth.getSession).toHaveBeenCalledTimes(1)
    mock.emit('SIGNED_OUT', null)
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', user: null })
  })

  it('handles login success, safe login failure, and logout without touching game state', async () => {
    mock.auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null })
    expect(await useAuthStore.getState().signIn('ada@example.test', 'password')).toBeUndefined()
    expect(useAuthStore.getState().user).toEqual({ id: 'user-123' })

    mock.auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: new Error('bad credentials') })
    await expect(useAuthStore.getState().signIn('ada@example.test', 'wrong')).resolves.toContain('Không thể')

    await useAuthStore.getState().signOut()
    expect(mock.auth.signOut).toHaveBeenCalledOnce()
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', user: null })
  })

  it('handles sign-up sessions and confirmation-required sign-ups without inventing auth state', async () => {
    mock.auth.signUp.mockResolvedValue({ data: { user: session.user, session }, error: null })
    await expect(useAuthStore.getState().signUp('new@example.test', 'password')).resolves.toEqual({ status: 'authenticated' })
    expect(useAuthStore.getState().user).toEqual({ id: 'user-123' })
    expect(mock.auth.signUp).toHaveBeenLastCalledWith({ email: 'new@example.test', password: 'password' })

    useAuthStore.setState({ status: 'anonymous', user: null })
    mock.auth.signUp.mockResolvedValue({ data: { user: session.user, session: null }, error: null })
    await expect(useAuthStore.getState().signUp('confirm@example.test', 'password')).resolves.toEqual({ status: 'confirmation-required' })
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', user: null })
  })

  it('returns safe sign-up errors without exposing provider messages', async () => {
    mock.auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: new Error('User already registered') })
    await expect(useAuthStore.getState().signUp('taken@example.test', 'password')).resolves.toEqual({ status: 'error', reason: 'duplicate-account' })

    mock.auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: new Error('network unavailable') })
    await expect(useAuthStore.getState().signUp('new@example.test', 'password')).resolves.toEqual({ status: 'error', reason: 'unavailable' })
  })

  it('returns the current access token without exposing it through app state', async () => {
    mock.auth.getSession.mockResolvedValue({ data: { session } })
    await useAuthStore.getState().initialize()

    await expect(getAuthAccessToken()).resolves.toBe('access-token')
    expect(useAuthStore.getState().user).toEqual({ id: 'user-123' })
    expect(JSON.stringify(useAuthStore.getState())).not.toContain('access-token')
  })

  it('falls back to guest state when token refresh/session lookup fails', async () => {
    mock.auth.getSession.mockResolvedValue({ data: { session }, error: null })
    await useAuthStore.getState().initialize()
    mock.auth.getSession.mockResolvedValue({ data: { session: null }, error: new Error('expired') })

    await expect(getAuthAccessToken()).resolves.toBeNull()
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', user: null })
  })
})
