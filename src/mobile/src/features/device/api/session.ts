import { API_URL } from '@/api/constants'
import { getDeviceToken } from '@/services/deviceTokenService'

export type DeviceSessionStatus =
  | 'enrolled'
  | 'needs_enrollment'
  | 'session_unavailable'

export type DeviceSessionInfo = {
  status: DeviceSessionStatus
  can_upload: boolean
  can_view: boolean
  session_reason?: string
  device_reason?: string
  device_message?: string
  simple_code?: string
  expires_at?: string | null
  revalidate_interval_seconds?: number
  max_validation_failure_seconds?: number
}

export async function fetchDeviceSession(
  qrToken: string
): Promise<DeviceSessionInfo> {
  const token = await getDeviceToken()
  const response = await fetch(
    `${API_URL}/api/device/session/${qrToken}`,
    {
      method: 'GET',
      headers: token ? { 'X-Device-Token': token } : {},
    }
  )
  const data = (await response.json().catch(() => ({}))) as DeviceSessionInfo
  return data
}
