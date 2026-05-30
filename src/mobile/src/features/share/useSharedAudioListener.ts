import { useEffect } from 'react'
import { Linking } from 'react-native'
import { ingestAudioFile } from './ingestAudio'

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
      if (initial) ingestAudioFile(initial)
    })
    const subscription = Linking.addEventListener('url', ({ url }) => {
      ingestAudioFile(url)
    })
    return () => {
      subscription.remove()
    }
  }, [])
}
