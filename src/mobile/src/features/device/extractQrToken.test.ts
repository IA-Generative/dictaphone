import { describe, expect, it } from 'vitest'
import { extractQrToken } from './extractQrToken'

describe('extractQrToken', () => {
  it('returns null for empty input', () => {
    expect(extractQrToken('')).toBeNull()
    expect(extractQrToken('   ')).toBeNull()
  })

  it('accepts a raw qr_token', () => {
    expect(extractQrToken('abc12345')).toBe('abc12345')
    expect(extractQrToken('Abc-123_xyz')).toBe('Abc-123_xyz')
  })

  it('extracts qr_token from a full upload URL', () => {
    expect(
      extractQrToken('https://upload.example.gouv.fr/upload/tok_42_AbC')
    ).toBe('tok_42_AbC')
  })

  it('handles URLs with query string', () => {
    expect(
      extractQrToken(
        'https://upload.example.gouv.fr/upload/tok_42?dk=abcd&foo=1'
      )
    ).toBe('tok_42')
  })

  it('strips surrounding whitespace before parsing', () => {
    expect(extractQrToken('  abc12345  ')).toBe('abc12345')
    expect(
      extractQrToken('  https://upload.example.gouv.fr/upload/tok42  ')
    ).toBe('tok42')
  })

  it('returns null for URLs without an /upload/ path', () => {
    expect(extractQrToken('https://example.com/')).toBeNull()
    expect(extractQrToken('https://example.com/other/tok42')).toBeNull()
  })

  it('returns null for unrecognized strings', () => {
    expect(extractQrToken('!!!')).toBeNull()
    expect(extractQrToken('contains spaces')).toBeNull()
  })

  it('rejects tokens shorter than the min length', () => {
    expect(extractQrToken('short')).toBeNull()
  })
})
