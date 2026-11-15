import { API_URL } from '@/api/constants'

// The mes-réunions admin UI generates a 6-character "simple code" alongside
// the QR. We resolve it to a qr_token via the existing PWA endpoint, then
// enroll the same way as the QR flow.
export async function resolveSimpleCode(code: string): Promise<string | null> {
  const cleaned = code.trim().toUpperCase()
  if (!cleaned) return null
  const body = new URLSearchParams({ code: cleaned }).toString()
  const response = await fetch(`${API_URL}/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  // The PWA endpoint returns a 302 redirect to /upload/<qr_token>. React
  // Native's fetch follows the redirect automatically and exposes the final
  // URL via response.url, from which we extract the token.
  if (response.ok || response.status === 302) {
    const finalUrl = response.url || ''
    const match = finalUrl.match(/\/upload\/([A-Za-z0-9_-]+)/)
    if (match) return match[1]
  }
  return null
}
