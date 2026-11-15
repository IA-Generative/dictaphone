import { API_URL } from '@/api/constants'
import { ApiError } from '@/api/ApiError'
import { parseRetryAfter, recordRateLimit } from '@/api/rateLimits'
import { getDeviceToken } from '@/services/deviceTokenService'
import { useDeviceStore } from '@/features/device/store'
import type { UploadProgressCallback } from '@/utils/fileUpload'

export type UploadResponse = {
  file_id: string
  filename: string
  status: string
  remaining?: number
}

// Strip non-ASCII characters from a filename so RN's FormData doesn't
// URL-encode them. Diacritics are normalized to their base letter, every
// remaining non-[A-Za-z0-9._-] becomes a hyphen, and consecutive
// separators are collapsed.
export function sanitizeFilename(filename: string): string {
  return (
    filename
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '') // strip combining marks (accents)
      .replace(/['`’]/g, '') // smart/regular apostrophes
      .replace(/[^A-Za-z0-9._-]+/g, '_') // remaining non-ASCII / punctuation → _
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 200) || 'audio.m4a'
  )
}

export function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  switch (ext) {
    case 'm4a':
    case 'mp4':
      return 'audio/mp4'
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'flac':
      return 'audio/flac'
    case 'aac':
      return 'audio/aac'
    case 'caf':
      return 'audio/x-caf'
    case 'aiff':
    case 'aif':
      return 'audio/aiff'
    default:
      return 'audio/mp4'
  }
}

// POST /api/upload/<qr_token> via XHR so we can stream upload.onprogress to
// the UI. Mirrors the PWA exactly — server runs antivirus + normalize +
// transcription on the resulting object and publishes Socket.IO `file_status`
// events on the qr_token room as the pipeline advances.
export async function uploadRecordingToMirai({
  filePath,
  filename,
  onProgress,
}: {
  filePath: string
  filename: string
  onProgress?: UploadProgressCallback
}): Promise<UploadResponse> {
  const enrollment = useDeviceStore.getState().enrollment
  if (!enrollment) throw new Error('Device not enrolled')
  const deviceToken = await getDeviceToken()
  if (!deviceToken) throw new Error('Missing device token')

  const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`
  const url = `${API_URL}/api/upload/${enrollment.qrToken}`
  // React Native's FormData URL-encodes non-ASCII chars in the simple
  // `filename=` attribute (instead of using RFC 5987 `filename*=UTF-8''`),
  // which the server stores verbatim. We sanitize to plain ASCII to keep
  // the stored object name readable.
  const safeFilename = sanitizeFilename(filename)

  const formData = new FormData()
  formData.append('file', {
    uri,
    name: safeFilename,
    type: guessMimeType(safeFilename),
  } as unknown as Blob)

  console.log(`[uploadRecording] POST ${url} file=${safeFilename}`)

  return new Promise<UploadResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('X-Device-Token', deviceToken)
    xhr.setRequestHeader('Accept', 'application/json')

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return
        const progress = event.total > 0 ? event.loaded / event.total : 0
        onProgress({
          uploadedBytes: event.loaded,
          totalBytes: event.total,
          progress,
          percentage: progress * 100,
        })
      }
    }

    xhr.onload = () => {
      console.log(
        `[uploadRecording] status=${xhr.status} body=${xhr.responseText.slice(0, 200)}`
      )
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResponse)
        } catch {
          reject(new Error('Invalid JSON response from upload'))
        }
        return
      }
      // Reject with an ApiError so the upload manager classifies the failure
      // (retry with backoff on 5xx/408, block on 401/403/4xx, pause on 429).
      // The server's `error` field becomes the message shown on the row.
      let body: unknown = xhr.responseText
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        /* keep raw text */
      }
      const retryAt =
        xhr.status === 429
          ? parseRetryAfter(xhr.getResponseHeader('Retry-After'))
          : null
      if (xhr.status === 429) recordRateLimit('upload', retryAt)
      const error = new ApiError(xhr.status, body, retryAt, {
        method: 'POST',
        path: '/api/upload/[qr_token]',
      })
      const serverMessage = (body as { error?: unknown } | null)?.error
      if (typeof serverMessage === 'string' && serverMessage) {
        error.message = serverMessage
      }
      reject(error)
    }

    xhr.onerror = () => {
      console.log(
        `[uploadRecording] onerror status=${xhr.status} readyState=${xhr.readyState}`
      )
      reject(new Error('Network error during upload'))
    }

    xhr.ontimeout = () => reject(new Error('Upload timed out'))

    xhr.send(formData)
  })
}
