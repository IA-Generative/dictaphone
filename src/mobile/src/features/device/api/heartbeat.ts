import { API_URL } from '@/api/constants'
import {
  getDeviceToken,
  setDeviceToken,
} from '@/services/deviceTokenService'

type HeartbeatResponse = {
  valid?: boolean
  retention_until?: number
  refreshed_device_token?: string | null
}

// Called from foreground hook on a timer. Swaps the stored device_token if the
// server issued a fresh one (e.g. retention bumped via mydevices "Renew").
export async function deviceHeartbeat(): Promise<HeartbeatResponse | null> {
  const token = await getDeviceToken()
  if (!token) return null

  let response: Response
  try {
    response = await fetch(`${API_URL}/api/device/heartbeat`, {
      method: 'POST',
      headers: { 'X-Device-Token': token, 'Content-Type': 'application/json' },
    })
  } catch {
    return null
  }
  if (!response.ok) return null

  const data = (await response
    .json()
    .catch(() => ({}))) as HeartbeatResponse
  if (data.refreshed_device_token) {
    await setDeviceToken(data.refreshed_device_token)
  }
  return data
}
