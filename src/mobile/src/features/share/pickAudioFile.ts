import { pick, keepLocalCopy, types } from '@react-native-documents/picker'
import { ingestAudioFile } from './ingestAudio'

// Opens the iOS file picker (Files.app) restricted to audio types.
// Returns true if a file was queued for upload, false if the user
// cancelled or chose something unusable.
export async function pickAudioFile(): Promise<boolean> {
  console.log('[pickAudioFile] presenting picker')
  let results
  try {
    results = await pick({
      type: [types.audio],
      allowMultiSelection: false,
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.log('[pickAudioFile] pick threw:', err?.code, e)
    if (err?.code === 'OPERATION_CANCELED') return false
    // The native module gets stuck if iOS auto-dismisses the picker mid-
    // present (modal collision). Once stuck, every subsequent call gets
    // ASYNC_OP_IN_PROGRESS until the app is restarted. We surface a
    // clearer error so the user knows what to do.
    if (
      err?.code === 'ASYNC_OP_IN_PROGRESS' ||
      (typeof err?.message === 'string' &&
        err.message.includes('previous promise did not settle'))
    ) {
      throw new Error(
        'Picker bloqué après une présentation interrompue. Redémarrez l\'app pour réessayer.'
      )
    }
    throw e
  }

  console.log('[pickAudioFile] picked:', results)
  const picked = results[0]
  if (!picked?.uri) return false

  // The picker hands us a security-scoped URI on iOS. Copy into our cache
  // so the URI remains valid through the upload (which may take a while if
  // the user is offline or on wifi-only with no wifi).
  const fileName = picked.name ?? 'imported-audio.m4a'
  const copyResult = await keepLocalCopy({
    files: [{ uri: picked.uri, fileName }],
    destination: 'cachesDirectory',
  })
  const copy = copyResult[0]
  if (copy.status !== 'success') {
    throw new Error(
      `Could not copy picked file locally (${copy.copyError ?? 'unknown error'})`
    )
  }

  return ingestAudioFile(copy.localUri, {
    name: fileName,
    bypassExtCheck: true,
  })
}
