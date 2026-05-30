import uuid from 'react-native-uuid'
import { useRecordingsStore } from '@/services/storage'

const AUDIO_EXTENSIONS = ['m4a', 'mp3', 'flac', 'wav', 'aac', 'caf', 'aiff']

export function isAudioFileUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0]
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`))
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
    uploadingStatus: 'to_upload',
  })
  return true
}
