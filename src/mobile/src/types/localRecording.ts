import { z } from 'zod/v4'
import { TRANSCRIPTION_LANGUAGES } from '@/features/ai-jobs/constants'

export const transcriptionLanguageSchema = z.enum(TRANSCRIPTION_LANGUAGES)

export const uploadingStatusSchema = z.enum([
  'to_upload',
  'uploading',
  'failed',
  'blocked',
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
  language: transcriptionLanguageSchema.default('fr'),
  uploadingStatus: uploadingStatusSchema,
  source: z.enum(['mobile_recording', 'mobile_file_upload']).optional(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  uploadId: z.string().optional(),
  fileId: z.string().optional(),
  uploadAttemptCount: z.number().int().nonnegative().optional(),
  uploadRetryAt: z.number().optional(),
  uploadBlockedReason: z
    .enum(['transient', 'authentication', 'permission', 'validation'])
    .optional(),
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
