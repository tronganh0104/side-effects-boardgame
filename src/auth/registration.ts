export type RegistrationValidationError =
  | 'invalid-email'
  | 'missing-password'
  | 'password-mismatch'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateRegistration(
  email: string,
  password: string,
  passwordConfirmation: string,
): RegistrationValidationError | undefined {
  if (!emailPattern.test(email.trim())) return 'invalid-email'
  if (!password) return 'missing-password'
  if (password !== passwordConfirmation) return 'password-mismatch'
  return undefined
}
