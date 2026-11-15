import { useEffect } from 'react'
import { AppState } from 'react-native'
import { deviceHeartbeat } from './api/heartbeat'
import { startDeviceHeartbeat } from './deviceHeartbeatLoop'
import { useDeviceStore } from './store'

// The mes-réunions DMZ requires the device to revalidate within
// `max_validation_failure_seconds` (advertised by /api/device/session, ~4h).
// Past that window the upload session is rejected ("token expired") even though
// the enrollment itself is still valid for days. `deviceHeartbeat` is what
// revalidates (and rotates the device_token when the server bumps retention),
// so we drive it here (see startDeviceHeartbeat). We stay comfortably under the 4h
// window. Without this hook the heartbeat was never called and uploads broke a
// few hours after enrollment.
export function useDeviceHeartbeat() {
  const enrolled = useDeviceStore((s) => Boolean(s.enrollment))

  useEffect(() => {
    if (!enrolled) return
    return startDeviceHeartbeat(deviceHeartbeat, (listener) =>
      AppState.addEventListener('change', listener)
    )
  }, [enrolled])
}
