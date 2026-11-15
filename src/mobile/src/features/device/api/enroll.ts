import DeviceInfo from 'react-native-device-info'
import { API_URL } from '@/api/constants'
import {
  getOrCreateDeviceKey,
  setDeviceToken,
  setQrToken,
} from '@/services/deviceTokenService'

type EnrollResponse = {
  device_token?: string
  retention_until?: number
  error?: string
  message?: string
}

async function deviceFingerprint(): Promise<string> {
  // The PWA concatenates UA + screen + tz. On native we use a stable
  // identifier set instead — this is what the token-issuer hashes server-side.
  const [uniqueId, model, systemVersion, brand] = await Promise.all([
    DeviceInfo.getUniqueId(),
    Promise.resolve(DeviceInfo.getModel()),
    Promise.resolve(DeviceInfo.getSystemVersion()),
    Promise.resolve(DeviceInfo.getBrand()),
  ])
  return [uniqueId, brand, model, systemVersion, 'native-ios']
    .join('|')
    .slice(0, 900)
}

export async function enrollDevice(qrToken: string): Promise<void> {
  const [deviceKey, fingerprint, deviceName] = await Promise.all([
    getOrCreateDeviceKey(),
    deviceFingerprint(),
    Promise.resolve(DeviceInfo.getModel()),
  ])

  const response = await fetch(`${API_URL}/api/device/enroll/${qrToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_key: deviceKey,
      device_fingerprint: fingerprint,
      device_name: deviceName,
    }),
  })

  const data = (await response.json().catch(() => ({}))) as EnrollResponse
  if (!response.ok || !data.device_token) {
    throw new Error(
      data.message ||
        data.error ||
        `Enrollment failed (HTTP ${response.status})`
    )
  }

  await Promise.all([setDeviceToken(data.device_token), setQrToken(qrToken)])
}
