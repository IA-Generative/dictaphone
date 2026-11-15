import { useEffect } from 'react'
import { io, type Socket } from 'socket.io-client'
import { API_URL } from '@/api/constants'
import { useDeviceStore } from '@/features/device/store'
import { useRecordingsStore } from '@/services/storage'
import type { PipelineStatus } from '@/types/localRecording'
import { pipelineStatusSchema } from '@/types/localRecording'

type FileStatusEvent = {
  file_id?: string
  name?: string
  status?: string
  message?: string
  quality?: number | null
}

const TERMINAL_SUCCESS: PipelineStatus[] = ['transferred', 'kevent_completed']
const TERMINAL_FAILURE: PipelineStatus[] = [
  'scan_infected',
  'quarantined',
  'error',
  'kevent_failed',
]

function isTerminalSuccess(status: PipelineStatus): boolean {
  return TERMINAL_SUCCESS.includes(status)
}

function isTerminalFailure(status: PipelineStatus): boolean {
  return TERMINAL_FAILURE.includes(status)
}

// Subscribes to the mes-réunions DMZ Socket.IO room scoped to the current
// qr_token. Every `file_status` event updates the matching local recording.
// On a terminal success status the recording is removed from the list
// (delayed a few seconds so the user briefly sees the green checkmark).
export function useFileStatusSocket() {
  const qrToken = useDeviceStore((s) => s.enrollment?.qrToken)

  useEffect(() => {
    if (!qrToken) return

    // Use the default transport order (polling first, then upgrade to
    // websocket). The mes-réunions DMZ engine.io server rejects a direct
    // websocket connection ("Invalid websocket upgrade", HTTP 400) — it
    // requires the initial polling handshake to mint a session id before
    // upgrading. Forcing `transports: ['websocket']` here meant the socket
    // never connected, so `file_status` events never arrived and uploads
    // were stuck spinning on the server-side pipeline status. This mirrors
    // the PWA, which relies on socket.io's default transports.
    const socket: Socket = io(API_URL, {
      reconnection: true,
      reconnectionDelay: 2000,
    })

    // A `file_status` event can arrive before the upload's HTTP response has
    // set `serverFileId` on the recording: the socket connection is already
    // open and the server emits status events from its pipeline worker, which
    // for a small/fast file can beat the multipart POST response being parsed
    // on-device. We buffer events whose file_id has no recording yet (keeping
    // the latest per id) and replay them once a recording adopts that id —
    // otherwise a terminal `kevent_completed` is dropped and the row spins
    // forever.
    const pendingByFileId = new Map<string, FileStatusEvent>()

    const applyEvent = (recordingId: string, data: FileStatusEvent) => {
      const parsedStatus = pipelineStatusSchema.safeParse(data.status)
      const status: PipelineStatus | undefined = parsedStatus.success
        ? parsedStatus.data
        : undefined

      const store = useRecordingsStore.getState()
      const recording = store.recordings.find((r) => r.id === recordingId)
      if (!recording) return

      store.updateRecording(recording.id, {
        serverStatus: status ?? recording.serverStatus,
        serverStatusMessage: data.message || undefined,
      })

      if (status && isTerminalSuccess(status)) {
        // Leave the green tick visible for a moment before clearing the row.
        setTimeout(() => {
          useRecordingsStore.getState().deleteRecording(recording.id)
        }, 4000)
      } else if (status && isTerminalFailure(status)) {
        // Block the recording so the row offers the Retry / Delete actions;
        // the server message is kept and shown on the row.
        store.updateRecording(recording.id, {
          uploadingStatus: 'blocked',
          uploadBlockedReason: 'validation',
        })
      }
    }

    socket.on('connect', () => {
      console.log('[fileStatus] socket connected, joining room', qrToken)
      socket.emit('join', { qr_token: qrToken })
    })

    socket.on('disconnect', (reason) => {
      console.log('[fileStatus] socket disconnected:', reason)
    })

    socket.on('file_status', (data: FileStatusEvent) => {
      if (!data.file_id || !data.status) return

      const recording = useRecordingsStore
        .getState()
        .recordings.find((r) => r.serverFileId === data.file_id)
      if (!recording) {
        // Not correlated yet — buffer and replay when the upload response
        // assigns this file_id to a recording.
        console.log(
          '[fileStatus] event buffered for not-yet-known file_id:',
          data.file_id,
          data.status
        )
        pendingByFileId.set(data.file_id, data)
        return
      }

      applyEvent(recording.id, data)
    })

    // Drain buffered events whenever recordings change (e.g. an upload just
    // set serverFileId). Cheap: guarded on a non-empty buffer.
    const unsubscribe = useRecordingsStore.subscribe((state) => {
      if (pendingByFileId.size === 0) return
      for (const [fileId, data] of pendingByFileId) {
        const recording = state.recordings.find(
          (r) => r.serverFileId === fileId
        )
        if (recording) {
          pendingByFileId.delete(fileId)
          applyEvent(recording.id, data)
        }
      }
    })

    return () => {
      unsubscribe()
      socket.disconnect()
    }
  }, [qrToken])
}
