import { useEffect } from 'react'
import { io } from 'socket.io-client'
import { API_URL } from '@/api/constants'
import { useDeviceStore } from '@/features/device/store'
import { useRecordingsStore } from '@/services/storage'
import { subscribeToFileStatus } from './fileStatusSocket'

// Subscribes to the mes-réunions DMZ Socket.IO room scoped to the current
// qr_token (see subscribeToFileStatus).
export function useFileStatusSocket() {
  const qrToken = useDeviceStore((s) => s.enrollment?.qrToken)

  useEffect(() => {
    if (!qrToken) return
    // Default transport order (polling first, then upgrade): the DMZ
    // engine.io server rejects a direct websocket upgrade (HTTP 400).
    return subscribeToFileStatus(
      qrToken,
      () => io(API_URL, { reconnection: true, reconnectionDelay: 2000 }),
      useRecordingsStore
    )
  }, [qrToken])
}
