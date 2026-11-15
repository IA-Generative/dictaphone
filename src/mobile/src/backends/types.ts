/**
 * RFC sketch — not wired yet. See docs/mobile-device-enrollment.md (Part B).
 *
 * The three seams a deployment may need to swap to talk to another backend.
 * Everything else (recorder, upload queue, retry and rate-limit handling,
 * UI) stays shared. Adapters reject with ApiError so the existing upload
 * manager keeps working unchanged.
 */
import type { LocalRecording } from '@/types/localRecording'
import type { UploadProgressCallback } from '@/utils/fileUpload'

export type EnrollmentInput =
  { kind: 'qr'; scannedValue: string } | { kind: 'code'; simpleCode: string }

export interface BackendAuth {
  /** Headers to add to every API call (e.g. Authorization or X-Device-Token). */
  getRequestHeaders(): Promise<Record<string, string>>
  /** Called on a 401: returns true if a new credential was obtained. */
  refresh(): Promise<boolean>
  /** Present when the backend supports enrollment from an SSO session. */
  enroll?(input: EnrollmentInput): Promise<void>
  logout(): Promise<void>
}

export type UploadedRecording = {
  /** Server identifier used to follow processing. */
  serverFileId: string
}

export interface BackendUpload {
  /** Uploads one recording; rejects with ApiError(status, body, retryAt). */
  upload(
    recording: LocalRecording,
    onProgress: UploadProgressCallback
  ): Promise<UploadedRecording>
}

export type ProcessingUpdate = {
  serverFileId: string
  /** Backend-specific status, mapped to a label by the adapter. */
  status: string
  terminal: 'success' | 'failure' | null
  message?: string
}

export interface BackendStatus {
  /** Starts following processing; returns the unsubscribe function. */
  subscribe(onUpdate: (update: ProcessingUpdate) => void): () => void
}

export interface MobileBackend {
  id: string
  auth: BackendAuth
  upload: BackendUpload
  status: BackendStatus
  capabilities: {
    qrEnrollment: boolean
    backgroundUpload: boolean
    remoteRecordings: boolean
    docsIntegration: boolean
  }
}
