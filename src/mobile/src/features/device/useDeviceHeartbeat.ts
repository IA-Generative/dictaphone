import { useEffect } from 'react'
import { AppState } from 'react-native'
import { deviceHeartbeat } from './api/heartbeat'
import { useDeviceStore } from './store'

// The mes-réunions DMZ requires the device to revalidate within
// `max_validation_failure_seconds` (advertised by /api/device/session, ~4h).
// Past that window the upload session is rejected ("token expired") even though
// the enrollment itself is still valid for days. `deviceHeartbeat` is what
// revalidates (and rotates the device_token when the server bumps retention),
// so we drive it here: once on mount, on every foreground transition, and on a
// periodic timer while the app stays open. We stay comfortably under the 4h
// window. Without this hook the heartbeat was never called and uploads broke a
// few hours after enrollment.
const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000 // 1h — well within the ~4h window

export function useDeviceHeartbeat() {
  const enrolled = useDeviceStore((s) => Boolean(s.enrollment))

  useEffect(() => {
    if (!enrolled) return

    const beat = () => {
      deviceHeartbeat().catch(() => {
        // Soft-fail: a missed beat is retried on the next tick / foreground.
      })
    }

    // Revalidate immediately so a stale session recovers as soon as the app
    // (re)opens, without waiting for the next interval.
    beat()

    const interval = setInterval(beat, HEARTBEAT_INTERVAL_MS)
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') beat()
    })

    return () => {
      clearInterval(interval)
      subscription.remove()
    }
  }, [enrolled])
}
