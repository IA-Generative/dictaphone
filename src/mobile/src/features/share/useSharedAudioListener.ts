import { useEffect } from 'react'
import { Linking } from 'react-native'
import { IS_E2E_BUILD } from '@/e2e'
import { ingestAudioFile } from './ingestAudio'

// E2E builds only: queue a host file as if it had been shared into the app
// (the CI simulator has no usable microphone). Ignored in store builds.
const E2E_INGEST_URL = 'fr-gouv-assistant-transcripts://e2e-ingest?path='

function handleIncomingUrl(url: string) {
  if (IS_E2E_BUILD && url.startsWith(E2E_INGEST_URL)) {
    const path = decodeURIComponent(url.slice(E2E_INGEST_URL.length))
    ingestAudioFile(`file://${path}`)
    return
  }
  ingestAudioFile(url)
}

// Listens for files sent into the app via:
//  - Share Sheet ("Ouvrir avec MIrAI Audio Secure…")
//  - Files.app → tap on an audio file
//  - AirDrop
//  - Open-in from other apps
// iOS copies the file to Documents/Inbox/ first, so the file:// URL we
// receive points to a file we own and can read without security scoping.
export function useSharedAudioListener() {
  useEffect(() => {
    void Linking.getInitialURL().then((initial) => {
      if (initial) handleIncomingUrl(initial)
    })
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url)
    })
    return () => {
      subscription.remove()
    }
  }, [])
}
