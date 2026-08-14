import { describe, expect, it } from 'vitest'
import { validateRegistration } from '../registration'

describe('registration validation', () => {
  it.each([
    ['', 'password', 'password', 'invalid-email'],
    ['not-an-email', 'password', 'password', 'invalid-email'],
    ['new@example.test', '', '', 'missing-password'],
    ['new@example.test', 'password', 'different', 'password-mismatch'],
  ])('rejects invalid input before a sign-up request', (email, password, confirmation, expected) => {
    expect(validateRegistration(email, password, confirmation)).toBe(expected)
  })

  it('accepts matching non-empty credentials for Supabase validation', () => {
    expect(validateRegistration('new@example.test', 'password', 'password')).toBeUndefined()
  })
})
