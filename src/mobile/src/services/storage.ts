import { createJSONStorage, persist } from 'zustand/middleware'
import { create } from 'zustand'
import { type LocalRecording, recordingSchema } from '../types/localRecording'
import { type AppSettings, appSettingsSchema } from '../types/settings'
import { z } from 'zod/v4'
import NetInfo from '@react-native-community/netinfo'
import { uploadRecordingToMirai } from '@/features/files/api/uploadRecording'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'
import { mmkvStorage } from '@/services/index'

// HEAD-like existence check for a file:// URI via XHR. iOS's RCTNetworking
// dispatches a tiny GET request against the local file — if it can't be
// opened, onerror fires within milliseconds.
function fileExists(fileUri: string): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', fileUri, true)
    xhr.responseType = 'arraybuffer'
    xhr.timeout = 2000
    xhr.onload = () => resolve(true)
    xhr.onerror = () => resolve(false)
    xhr.ontimeout = () => resolve(false)
    xhr.send()
  })
}

const defaultSettings: AppSettings = {
  language: 'en',
  wifiOnlyUpload: true,
}

const recordingListSchema = z.array(recordingSchema)

export interface RecordingsStore {
  hasHydrated: boolean
  recordings: LocalRecording[]
  addRecording: (recording: LocalRecording) => void
  deleteRecording: (recordingId: string) => void
  updateRecording: (
    id: string,
    data: Partial<Omit<LocalRecording, 'id'>>
  ) => void
}

export interface SettingsStore {
  hasHydrated: boolean
  settings: AppSettings
  setSettings: (settings: AppSettings) => void
  resetSettings: () => void
}

export interface UploadStore {
  bypassWifiOnly: boolean
  setBypassWifiOnly: (value: boolean) => void
}

const checkCanUpload = async (): Promise<boolean> => {
  let state
  try {
    state = await NetInfo.fetch()
  } catch (error) {
    console.error('Failed to fetch network state:', error)
    return false
  }
  if (state.isConnected !== true || state.isInternetReachable === false) {
    return false
  }
  const { settings } = useSettingsStore.getState()
  const { bypassWifiOnly } = useUploadStore.getState()
  if (settings.wifiOnlyUpload && !bypassWifiOnly) {
    return state.type === 'wifi'
  }
  return true
}

let isUploadInProgress = false
const triggerUpload = async (): Promise<void> => {
  if (isUploadInProgress) {
    return
  }

  const canUpload = await checkCanUpload()
  if (!canUpload) {
    return
  }

  const { recordings, updateRecording, deleteRecording } =
    useRecordingsStore.getState()
  const recordingToUpload =
    recordings.find((r) => r.uploadingStatus === 'to_upload') ?? null

  if (!recordingToUpload) {
    // reset bypass wifiOnly
    setBypassWifiOnly(false)
    return
  }

  // Cheap pre-flight: if the underlying file is gone (e.g. the app was
  // reinstalled and the sandbox container UUID changed), drop the entry
  // before attempting the multipart upload — otherwise the fetch silently
  // stalls and Metro disconnects.
  const exists = await fileExists(recordingToUpload.filePath)
  if (!exists) {
    console.warn(
      'Recording file missing on disk, dropping:',
      recordingToUpload.filePath
    )
    deleteRecording(recordingToUpload.id)
    isUploadInProgress = false
    triggerUpload().catch(console.error)
    return
  }

  isUploadInProgress = true
  updateRecording(recordingToUpload.id, { uploadingStatus: 'uploading' })

  try {
    // Shared files keep their original filename (with extension); recorder
    // outputs untitled .m4a, so we append the extension if missing.
    const filename = /\.[^./\\]+$/.test(recordingToUpload.title)
      ? recordingToUpload.title
      : `${recordingToUpload.title}.m4a`
    const response = await uploadRecordingToMirai({
      filePath: recordingToUpload.filePath,
      filename,
      onProgress: (progress) => {
        updateRecording(recordingToUpload.id, {
          uploadProgress: progress,
        })
      },
    })
    // Keep the recording in the list so we can show the pipeline status
    // (antivirus → transcoding → transferred) coming from the Socket.IO
    // `file_status` events. The row is only removed when the pipeline
    // reaches a terminal success state (cf. useFileStatusSocket).
    updateRecording(recordingToUpload.id, {
      uploadingStatus: 'uploaded',
      serverFileId: response.file_id,
      serverStatus: 'pending',
      serverStatusMessage: undefined,
      uploadProgress: {
        uploadedBytes: 1,
        totalBytes: 1,
        progress: 1,
        percentage: 100,
      },
    })
    await queryClient.invalidateQueries({ queryKey: [keys.files] })
  } catch (error) {
    console.error('Upload to mirai failed:', error)
    const message =
      error instanceof Error ? error.message : String(error ?? '')
    // App reinstall changes the sandbox container UUID, so any recording
    // whose absolute path points to the previous container can never be
    // uploaded. Drop the entry rather than leaving it stuck as 'failed'.
    const isFileMissing =
      message.includes('no such file') ||
      message.includes('No such file') ||
      message.includes("couldn't be opened") ||
      message.includes('NSPOSIXErrorDomain Code=2') ||
      message.includes('NSCocoaErrorDomain Code=260')
    if (isFileMissing) {
      console.warn(
        'Recording file no longer exists, dropping entry:',
        recordingToUpload.id
      )
      deleteRecording(recordingToUpload.id)
    } else {
      updateRecording(recordingToUpload.id, { uploadingStatus: 'failed' })
    }
  } finally {
    isUploadInProgress = false
    triggerUpload().catch(console.error)
  }
}

export const setBypassWifiOnly = (value: boolean) => {
  useUploadStore.getState().setBypassWifiOnly(value)
  if (value) {
    triggerUpload().catch(console.error)
  }
}

let isRecordingsUploadManagerStarted = false
const startRecordingsUploadManager = () => {
  if (isRecordingsUploadManagerStarted) {
    return
  }
  isRecordingsUploadManagerStarted = true

  useRecordingsStore.subscribe((state) => {
    if (state.recordings.some((r) => r.uploadingStatus === 'to_upload')) {
      triggerUpload().catch(console.error)
    }
  })

  NetInfo.addEventListener(() => {
    triggerUpload().catch(console.error)
  })

  triggerUpload().catch(console.error)
}

export const useRecordingsStore = create<RecordingsStore>()(
  persist(
    (set) => ({
      hasHydrated: false,
      recordings: [],
      addRecording: (recording) =>
        set((state) => ({ recordings: [recording, ...state.recordings] })),
      deleteRecording: (recordingId) =>
        set((state) => ({
          recordings: state.recordings.filter(
            (recording) => recording.id !== recordingId
          ),
        })),
      updateRecording: (id, data) =>
        set((state) => ({
          recordings: state.recordings.map((recording) =>
            recording.id === id ? { ...recording, ...data } : recording
          ),
        })),
    }),
    {
      name: 'recordings',
      storage: createJSONStorage(() => mmkvStorage),
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (state) {
          const parsed = recordingListSchema.safeParse(state.recordings)
          state.recordings = parsed.success
            ? // Reset transient client states ('uploading' → 'to_upload') so
              // the upload pipeline picks them up after a relaunch. Keep
              // 'uploaded' entries as-is — they have a serverFileId and the
              // Socket.IO listener is watching their pipeline progress.
              parsed.data.map((el) => ({
                ...el,
                uploadingStatus:
                  el.uploadingStatus === 'uploaded'
                    ? 'uploaded'
                    : 'to_upload',
                uploadProgress: undefined,
              }))
            : []
        }
        useRecordingsStore.setState({ hasHydrated: true })
      },
    }
  )
)

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      hasHydrated: false,
      settings: { ...defaultSettings },
      setSettings: (settings) => set({ settings }),
      resetSettings: () => set({ settings: defaultSettings }),
    }),
    {
      name: 'settings',
      storage: createJSONStorage(() => mmkvStorage),
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (state) {
          const parsed = appSettingsSchema.safeParse(state.settings)
          state.settings = parsed.success ? parsed.data : { ...defaultSettings }
        }
        useSettingsStore.setState({ hasHydrated: true })
      },
    }
  )
)

export const useUploadStore = create<UploadStore>()((set) => ({
  bypassWifiOnly: false,
  setBypassWifiOnly: (value) => set({ bypassWifiOnly: value }),
}))

startRecordingsUploadManager()
