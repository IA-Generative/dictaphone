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

    const socket: Socket = io(API_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
    })

    socket.on('connect', () => {
      console.log('[fileStatus] socket connected, joining room', qrToken)
      socket.emit('join', { qr_token: qrToken })
    })

    socket.on('disconnect', (reason) => {
      console.log('[fileStatus] socket disconnected:', reason)
    })

    socket.on('file_status', (data: FileStatusEvent) => {
      if (!data.file_id || !data.status) return
      const parsedStatus = pipelineStatusSchema.safeParse(data.status)
      const status: PipelineStatus | undefined = parsedStatus.success
        ? parsedStatus.data
        : undefined

      const store = useRecordingsStore.getState()
      const recording = store.recordings.find(
        (r) => r.serverFileId === data.file_id
      )
      if (!recording) {
        console.log(
          '[fileStatus] event for unknown file_id (ignored):',
          data.file_id,
          data.status
        )
        return
      }

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
        // Mark the local upload as failed so the existing 'failed' UX paths
        // (retry button, etc.) still work — server message kept for context.
        store.updateRecording(recording.id, { uploadingStatus: 'failed' })
      }
    })

    return () => {
      socket.disconnect()
    }
  }, [qrToken])
}
