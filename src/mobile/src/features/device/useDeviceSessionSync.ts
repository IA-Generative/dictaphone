import { useEffect } from 'react'
import { fetchDeviceSession } from './api/session'
import { useDeviceStore } from './store'

// On enrollment (or app foreground), fetch /api/device/session/<qr_token>
// to learn the simple_code and retention horizon. Updates the persisted
// store so the UI can display the code without re-scanning.
// Keyed on the qr_token only: the effect writes the enrollment back, so
// depending on the whole object re-fetched the session in a tight loop
// whenever the server's expires_at moved.
export function useDeviceSessionSync() {
  const qrToken = useDeviceStore((s) => s.enrollment?.qrToken)

  useEffect(() => {
    if (!qrToken) return
    let cancelled = false
    fetchDeviceSession(qrToken)
      .then((info) => {
        const enrollment = useDeviceStore.getState().enrollment
        if (cancelled || enrollment?.qrToken !== qrToken) return
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
  }, [qrToken])
}
