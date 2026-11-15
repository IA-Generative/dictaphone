import uuid from 'react-native-uuid'
import { useRecordingsStore, useSettingsStore } from '@/services/storage'

const AUDIO_EXTENSIONS = ['m4a', 'mp3', 'flac', 'wav', 'aac', 'caf', 'aiff']

export function isAudioFileUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0]
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`))
}

function deriveFileName(
  url: string,
  fallbackName?: string
): string | undefined {
  if (fallbackName) return fallbackName
  try {
    return decodeURIComponent(url.split('?')[0]).split('/').pop() || undefined
  } catch {
    return undefined
  }
}

function deriveTitle(url: string, fallbackName?: string): string {
  if (fallbackName) {
    return fallbackName.replace(/\.[^.]+$/, '')
  }
  try {
    const decoded = decodeURIComponent(url)
    const lastSegment = decoded.split('/').pop() ?? ''
    return lastSegment.replace(/\.[^.]+$/, '') || 'Audio importé'
  } catch {
    return 'Audio importé'
  }
}

// Add a file:// audio URL into the recordings queue. Used by both the
// share-in listener (incoming Open-in events) and the in-app file picker.
export function ingestAudioFile(
  url: string,
  options: { name?: string; bypassExtCheck?: boolean } = {}
): boolean {
  if (!url.startsWith('file://')) return false
  if (!options.bypassExtCheck && !isAudioFileUrl(url)) return false

  useRecordingsStore.getState().addRecording({
    id: String(uuid.v4()),
    title: deriveTitle(url, options.name),
    filePath: url,
    created_at: new Date().toISOString(),
    duration_seconds: 0,
    language: useSettingsStore.getState().newTranscriptionLanguage ?? 'fr',
    uploadingStatus: 'to_upload',
    source: 'mobile_file_upload',
    // Keep the original extension so the upload is not renamed to .m4a.
    fileName: deriveFileName(url, options.name),
  })
  return true
}
