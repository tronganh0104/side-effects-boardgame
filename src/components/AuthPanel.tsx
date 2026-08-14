import { useState } from 'react'
import { useAuthStore } from '../auth/authStore'
import { validateRegistration, type RegistrationValidationError } from '../auth/registration'
import { isSupabaseAuthConfigured } from '../auth/supabaseClient'
import { t } from '../i18n'

const EyeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeOffIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

type AuthMode = 'sign-in' | 'sign-up'

function registrationErrorMessage(error: RegistrationValidationError): string {
  if (error === 'invalid-email') return t('authInvalidEmail')
  if (error === 'missing-password') return t('authMissingPassword')
  return t('authPasswordMismatch')
}

function signUpErrorMessage(reason: 'duplicate-account' | 'invalid-password' | 'unavailable'): string {
  if (reason === 'duplicate-account') return t('authDuplicateAccount')
  if (reason === 'invalid-password') return t('authInvalidPassword')
  return t('authSignUpFailed')
}

export function AuthPanel() {
  if (!isSupabaseAuthConfigured) return null
  const status = useAuthStore((state) => state.status)
  const user = useAuthStore((state) => state.user)
  const signIn = useAuthStore((state) => state.signIn)
  const signUp = useAuthStore((state) => state.signUp)
  const signOut = useAuthStore((state) => state.signOut)
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setPassword('')
    setPasswordConfirmation('')
    setError(undefined)
    setSuccess(undefined)
  }

  if (status === 'loading') return null
  if (user) {
    return (
      <div className="auth-panel auth-signed-in">
        <span className="auth-label">{t('authSignedIn')}</span>
        <button className="auth-submit" type="button" onClick={() => void signOut()}>{t('authSignOut')}</button>
      </div>
    )
  }

  return (
    <section className="auth-panel" aria-label={t('authAccount')}>
      <div className="auth-tabs" role="tablist" aria-label={t('authAccount')}>
        <button className="auth-tab" type="button" role="tab" aria-selected={mode === 'sign-in'} onClick={() => switchMode('sign-in')}>
          {t('authSignIn')}
        </button>
        <button className="auth-tab" type="button" role="tab" aria-selected={mode === 'sign-up'} onClick={() => switchMode('sign-up')}>
          {t('authSignUp')}
        </button>
      </div>
      <form className="auth-form" onSubmit={(event) => {
        event.preventDefault()
        if (submitting) return
        setError(undefined)
        setSuccess(undefined)
        if (mode === 'sign-up') {
          const validationError = validateRegistration(email, password, passwordConfirmation)
          if (validationError) {
            setError(registrationErrorMessage(validationError))
            return
          }
        }
        setSubmitting(true)
        if (mode === 'sign-in') {
          void signIn(email, password).then(setError).finally(() => setSubmitting(false))
          return
        }
        void signUp(email.trim(), password).then((result) => {
          if (result.status === 'confirmation-required') setSuccess(t('authConfirmationRequired'))
          if (result.status === 'error') setError(signUpErrorMessage(result.reason))
        }).finally(() => setSubmitting(false))
      }}>
        <label className="auth-field">
          <span className="auth-label">{t('authEmail')}</span>
          <input className="auth-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        </label>
        <label className="auth-field">
          <div className="auth-field-header">
            <span className="auth-label">{t('authPassword')}</span>
            <button type="button" className="auth-toggle-password" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          <input className="auth-input" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} required />
        </label>
        {mode === 'sign-up' && (
          <label className="auth-field">
            <div className="auth-field-header">
              <span className="auth-label">{t('authPasswordConfirmation')}</span>
            </div>
            <input className="auth-input" type={showPassword ? "text" : "password"} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" required />
          </label>
        )}
        <button className="auth-submit primary" type="submit" disabled={submitting}>
          {submitting ? t('authSubmitting') : mode === 'sign-up' ? t('authCreateAccount') : t('authSignIn')}
        </button>
      </form>
      <div className="auth-message-area">
        {error && <span className="error auth-message" role="alert">{error}</span>}
        {success && <span className="success auth-message" role="status">{success}</span>}
      </div>
    </section>
  )
}
