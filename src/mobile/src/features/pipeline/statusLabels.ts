import type { TFunction } from 'i18next'
import type { PipelineStatus } from '@/types/localRecording'

// Mirrors the labels in services/mobile-upload-pwa/app/templates/upload_page.html
// — keeps the wording aligned between PWA and native app.
export function pipelineStatusLabel(
  status: PipelineStatus,
  t: TFunction
): string {
  const key = `pipeline.status.${status}`
  const fallback: Record<PipelineStatus, string> = {
    pending: 'En attente…',
    scanning: 'Analyse antivirale…',
    scan_clean: 'Fichier sain, transcodage…',
    scan_infected: '⚠️ Virus détecté',
    quarantined: '⚠️ Fichier en quarantaine',
    transcoding: 'Transcodage…',
    transcoded: 'Traitement terminé',
    ready_for_transfer: 'Prêt pour transfert',
    transferring: 'Transfert en cours…',
    transferred: '✅ Intégré à votre compte',
    error: '❌ Erreur de traitement',
    kevent_queued: 'En file de transcription…',
    kevent_transcribing: 'Transcription en cours…',
    kevent_processing: 'Traitement…',
    kevent_completed: '✅ Transcription terminée',
    kevent_partially_completed: 'Transcription partielle',
    kevent_failed: '❌ Transcription échouée',
  }
  // Try i18n first, fall back to the literal table.
  const translated = t(key, { defaultValue: '' })
  return translated || fallback[status] || status
}
