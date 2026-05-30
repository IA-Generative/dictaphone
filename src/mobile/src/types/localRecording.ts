import { z } from 'zod/v4'

export const uploadingStatusSchema = z.enum([
  'to_upload',
  'uploading',
  'failed',
  'uploaded',
])

// Server-side pipeline statuses sent over Socket.IO by mes-réunions.
// Mirrors the labels in services/mobile-upload-pwa/app/templates/upload_page.html.
export const pipelineStatusSchema = z.enum([
  'pending',
  'scanning',
  'scan_clean',
  'scan_infected',
  'quarantined',
  'transcoding',
  'transcoded',
  'ready_for_transfer',
  'transferring',
  'transferred',
  'error',
  // Kevent transcription substates — surfaced as-is for power users.
  'kevent_queued',
  'kevent_transcribing',
  'kevent_processing',
  'kevent_completed',
  'kevent_partially_completed',
  'kevent_failed',
])

export const recordingSchema = z.object({
  created_at: z.string(),
  duration_seconds: z.number().nonnegative(),
  filePath: z.string(),
  id: z.string(),
  title: z.string(),
  uploadingStatus: uploadingStatusSchema,
  uploadProgress: z
    .object({
      uploadedBytes: z.number().nonnegative(),
      totalBytes: z.number().nonnegative(),
      progress: z.number().min(0).max(1),
      percentage: z.number().min(0).max(100),
    })
    .optional(),
  // Server-side identifiers and pipeline state, populated after the multipart
  // upload returns. Used to correlate Socket.IO `file_status` events.
  serverFileId: z.string().optional(),
  serverStatus: pipelineStatusSchema.optional(),
  serverStatusMessage: z.string().optional(),
})

export type LocalRecording = z.infer<typeof recordingSchema>
export type PipelineStatus = z.infer<typeof pipelineStatusSchema>
