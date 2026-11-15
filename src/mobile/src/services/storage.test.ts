import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalRecording } from '../types/localRecording'
import { ApiError } from '../api/ApiError'
import {
  areUploadsPaused,
  clearRateLimits,
  recordRateLimit,
} from '../api/rateLimits'

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  enrollment: { qrToken: 'qr', enrolledAtTs: 0 } as {
    qrToken: string
    enrolledAtTs: number
  } | null,
  clearUpload: vi.fn(),
  resumeUpload: vi.fn(),
  nativeEvents: [] as ((state: { isConnected: boolean }) => void)[],
  storage: new Map<string, string>(),
}))

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: vi.fn() },
}))
vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: async () => ({ isConnected: true, type: 'wifi' }),
    addEventListener: (listener: (state: { isConnected: boolean }) => void) => {
      mocks.nativeEvents.push(listener)
      return () => {}
    },
  },
}))
vi.mock('@/features/files/api/uploadRecording', () => ({
  uploadRecordingToMirai: mocks.upload,
}))
vi.mock('@/features/device/store', () => ({
  useDeviceStore: {
    getState: () => ({ enrollment: mocks.enrollment }),
    subscribe: vi.fn(),
  },
}))
vi.mock('@/services/index', () => ({
  mmkvStorage: {
    getItem: (key: string) => mocks.storage.get(key) ?? null,
    setItem: (key: string, value: string) => mocks.storage.set(key, value),
    removeItem: (key: string) => mocks.storage.delete(key),
  },
}))
vi.mock('@/utils/localRecordingFile', () => ({
  deleteLocalRecordingFile: vi.fn().mockResolvedValue(undefined),
  localRecordingFileExists: async () => true,
  listDocumentM4AFiles: async () => [],
  getFileName: (name: string) => name,
}))
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/features/recordings/utils/concatSubAudioFiles', () => ({
  concatSubAudioFiles: vi.fn(),
  FILENAME_PREFIX_SEPARATOR: '-',
}))
vi.mock('react-native-uuid', () => ({ default: { v4: () => 'id' } }))
vi.mock('@/utils/fileUpload', () => ({
  clearUpload: mocks.clearUpload,
  resumeUpload: mocks.resumeUpload,
  setFileUploadAppActive: vi.fn(),
}))

import {
  deleteBlockedRecording,
  resumeRateLimitedUploads,
  startRecordingsUploadManager,
  useRecordingsStore,
} from './storage'
import { restoreUploadAfterRestart } from './uploadRetry'

const recording = (id: string): LocalRecording => ({
  id,
  title: id,
  filePath: `/${id}.m4a`,
  created_at: '2026-10-19T12:00:00Z',
  duration_seconds: 10,
  uploadingStatus: 'to_upload',
  language: 'fr',
})

const throttle = () => {
  recordRateLimit('upload', Date.now() + 60_000)
  return new ApiError(429, {}, Date.now() + 60_000)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  clearRateLimits()
  useRecordingsStore.setState({
    recordings: [],
    hasHydrated: true,
    recoverFilesStatus: { status: 'done', recovered: [] },
  })
  mocks.enrollment = { qrToken: 'qr', enrolledAtTs: 0 }
  mocks.clearUpload.mockResolvedValue(undefined)
  mocks.resumeUpload.mockResolvedValue(undefined)
  mocks.upload.mockResolvedValue({ file_id: 'server-file' })
})

const uploadedIds = () =>
  useRecordingsStore
    .getState()
    .recordings.filter((r) => r.uploadingStatus === 'uploaded')
    .map((r) => r.id)

afterEach(() => vi.restoreAllMocks())

describe('MIrAI upload', () => {
  it('keeps an uploaded recording to follow the server pipeline', async () => {
    startRecordingsUploadManager()
    useRecordingsStore.getState().addRecording(recording('ok'))
    await vi.waitFor(() =>
      expect(useRecordingsStore.getState().recordings[0]).toMatchObject({
        uploadingStatus: 'uploaded',
        serverFileId: 'server-file',
        serverStatus: 'pending',
      })
    )
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ filePath: '/ok.m4a', filename: 'ok.m4a' })
    )
  })

  it('does not upload an uploaded recording again after a restart', () => {
    expect(
      restoreUploadAfterRestart({
        ...recording('done'),
        uploadingStatus: 'uploaded',
        serverFileId: 'server-file',
      }).uploadingStatus
    ).toBe('uploaded')
  })

  it('does not upload while the device is not enrolled', async () => {
    mocks.enrollment = null
    startRecordingsUploadManager()
    useRecordingsStore.getState().addRecording(recording('waiting'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('blocks on a rejected device token and keeps the server reason', async () => {
    startRecordingsUploadManager()
    const error = new ApiError(401, { error: 'Jeton expiré' })
    error.message = 'Jeton expiré'
    mocks.upload.mockRejectedValueOnce(error)
    useRecordingsStore.getState().addRecording(recording('expired'))
    await vi.waitFor(() =>
      expect(useRecordingsStore.getState().recordings[0]).toMatchObject({
        uploadingStatus: 'blocked',
        uploadBlockedReason: 'authentication',
        serverStatusMessage: 'Jeton expiré',
      })
    )
  })

  it('keeps audio queued locally when the upload is throttled', async () => {
    startRecordingsUploadManager()
    mocks.upload.mockImplementationOnce(async () => {
      throw throttle()
    })
    useRecordingsStore.getState().addRecording(recording('throttled'))
    await vi.waitFor(() => expect(areUploadsPaused()).toBe(true))
    await vi.waitFor(() =>
      expect(useRecordingsStore.getState().recordings[0].uploadingStatus).toBe(
        'to_upload'
      )
    )

    resumeRateLimitedUploads()
    await vi.waitFor(() => expect(uploadedIds()).toEqual(['throttled']))
    expect(mocks.upload).toHaveBeenCalledTimes(2)
  })
})

describe('rate-limit auto resume', () => {
  it('resumes uploads by itself once Retry-After expires', async () => {
    startRecordingsUploadManager()
    mocks.upload.mockImplementationOnce(async () => {
      recordRateLimit('upload', Date.now() + 50)
      throw new ApiError(429, {}, Date.now() + 50)
    })
    useRecordingsStore.getState().addRecording(recording('auto'))
    await vi.waitFor(() => expect(areUploadsPaused()).toBe(true))
    await vi.waitFor(() => expect(uploadedIds()).toEqual(['auto']))
    expect(areUploadsPaused()).toBe(false)
    expect(mocks.upload).toHaveBeenCalledTimes(2)
  })

  it('waits for the user when the server gives no Retry-After', async () => {
    startRecordingsUploadManager()
    recordRateLimit('upload', null)
    useRecordingsStore.getState().addRecording(recording('manual'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(areUploadsPaused()).toBe(true)
    expect(mocks.upload).not.toHaveBeenCalled()
  })
})

describe('blocked uploads recovery', () => {
  const blocked = (
    id: string,
    reason: LocalRecording['uploadBlockedReason']
  ): LocalRecording => ({
    ...recording(id),
    uploadingStatus: 'blocked',
    uploadBlockedReason: reason,
    uploadAttemptCount: 3,
  })

  it('retries transient blocks when the device reconnects', async () => {
    startRecordingsUploadManager()
    useRecordingsStore.setState({
      recordings: [
        blocked('transient', 'transient'),
        blocked('bad', 'validation'),
      ],
    })
    for (const listener of mocks.nativeEvents) listener({ isConnected: false })
    for (const listener of mocks.nativeEvents) listener({ isConnected: true })
    await vi.waitFor(() => expect(uploadedIds()).toEqual(['transient']))
    expect(
      useRecordingsStore.getState().recordings.find((r) => r.id === 'bad')
        ?.uploadingStatus
    ).toBe('blocked')
  })

  it('lets the user delete a blocked recording and its native upload', async () => {
    useRecordingsStore.setState({
      recordings: [{ ...blocked('bad', 'validation'), uploadId: 'native' }],
    })
    await deleteBlockedRecording('bad')
    expect(mocks.clearUpload).toHaveBeenCalledExactlyOnceWith('native')
    expect(useRecordingsStore.getState().recordings).toEqual([])
  })

  it('does not delete a recording that is not blocked', async () => {
    useRecordingsStore.setState({ recordings: [recording('queued')] })
    await deleteBlockedRecording('queued')
    expect(useRecordingsStore.getState().recordings).toHaveLength(1)
  })
})
