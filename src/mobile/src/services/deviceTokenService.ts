import * as Keychain from 'react-native-keychain'
import QuickCrypto from 'react-native-quick-crypto'

const DEVICE_KEY_SERVICE = 'mirai_device_key'
const DEVICE_TOKEN_SERVICE = 'mirai_device_token'
const QR_TOKEN_SERVICE = 'mirai_qr_token'

async function getSecret(service: string): Promise<string | null> {
  const creds = await Keychain.getGenericPassword({ service })
  return creds ? creds.password : null
}

async function setSecret(service: string, value: string): Promise<void> {
  await Keychain.setGenericPassword(service, value, {
    service,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  })
}

async function clearSecret(service: string): Promise<void> {
  await Keychain.resetGenericPassword({ service })
}

// 24 random bytes, hex-encoded — matches the PWA format consumed by
// token-issuer (regex `^[0-9a-f]{1,64}$`).
export async function getOrCreateDeviceKey(): Promise<string> {
  const existing = await getSecret(DEVICE_KEY_SERVICE)
  if (existing) return existing
  const bytes = QuickCrypto.randomBytes(24)
  const hex = Array.from(bytes as Uint8Array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  await setSecret(DEVICE_KEY_SERVICE, hex)
  return hex
}

export function getDeviceToken(): Promise<string | null> {
  return getSecret(DEVICE_TOKEN_SERVICE)
}

export function setDeviceToken(token: string): Promise<void> {
  return setSecret(DEVICE_TOKEN_SERVICE, token)
}

export function getQrToken(): Promise<string | null> {
  return getSecret(QR_TOKEN_SERVICE)
}

export function setQrToken(qrToken: string): Promise<void> {
  return setSecret(QR_TOKEN_SERVICE, qrToken)
}

export async function clearDeviceCredentials(): Promise<void> {
  await Promise.all([
    clearSecret(DEVICE_TOKEN_SERVICE),
    clearSecret(QR_TOKEN_SERVICE),
  ])
}
