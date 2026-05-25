// QR codes printed by mes-réunions encode an https URL pointing at the
// upload page: e.g. https://upload.mirai.example/upload/<qr_token>?...
// Accept either the raw qr_token (e.g. typed manually) or the full URL.
export function extractQrToken(scannedValue: string): string | null {
  const trimmed = scannedValue.trim()
  if (!trimmed) return null

  // raw token: alphanumeric / hyphen / underscore — keep it simple, validate
  // server-side
  if (/^[A-Za-z0-9_-]{8,128}$/.test(trimmed)) {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    const match = url.pathname.match(/\/upload\/([A-Za-z0-9_-]+)/)
    if (match) return match[1]
  } catch {
    /* not a URL */
  }
  return null
}
