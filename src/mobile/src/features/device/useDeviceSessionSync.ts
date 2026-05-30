import { useEffect } from 'react'
import { fetchDeviceSession } from './api/session'
import { useDeviceStore } from './store'

// On enrollment (or app foreground), fetch /api/device/session/<qr_token>
// to learn the simple_code and retention horizon. Updates the persisted
// store so the UI can display the code without re-scanning.
export function useDeviceSessionSync() {
  const enrollment = useDeviceStore((s) => s.enrollment)

  useEffect(() => {
    if (!enrollment) return
    let cancelled = false
    fetchDeviceSession(enrollment.qrToken)
      .then((info) => {
        if (cancelled) return
        const next = {
          ...enrollment,
          simpleCode: info.simple_code ?? enrollment.simpleCode,
          retentionUntilTs:
            info.expires_at != null
              ? Date.parse(info.expires_at)
              : enrollment.retentionUntilTs,
        }
        const sameCode = next.simpleCode === enrollment.simpleCode
        const sameRetention =
          next.retentionUntilTs === enrollment.retentionUntilTs
        if (sameCode && sameRetention) return
        useDeviceStore.getState().setEnrollment(next)
      })
      .catch(() => {
        // Soft-fail: the banner just won't show the code yet.
      })
    return () => {
      cancelled = true
    }
  }, [enrollment])
}
