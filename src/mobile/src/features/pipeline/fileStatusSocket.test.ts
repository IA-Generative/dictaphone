import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import type { RecordingsStore } from '@/services/storage'
import type { LocalRecording } from '@/types/localRecording'
import {
  REMOVE_AFTER_SUCCESS_MS,
  subscribeToFileStatus,
  type FileStatusSocket,
} from './fileStatusSocket'

type Handler = (data?: unknown) => void

const fakeSocket = () => {
  const handlers = new Map<string, Handler>()
  const socket = {
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler)
      return socket
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }
  return {
    socket: socket as unknown as FileStatusSocket,
    emit: socket.emit,
    disconnect: socket.disconnect,
    fire: (event: string, data?: unknown) => handlers.get(event)?.(data),
  }
}

const recording = (data: Partial<LocalRecording> = {}): LocalRecording => ({
  id: 'rec',
  title: 'Réunion',
  filePath: '/rec.m4a',
  created_at: '2026-11-15T10:00:00Z',
  duration_seconds: 12,
  language: 'fr',
  uploadingStatus: 'uploaded',
  serverFileId: 'file-1',
  serverStatus: 'pending',
  ...data,
})

const makeStore = (recordings: LocalRecording[]) =>
  createStore<RecordingsStore>()((set) => ({
    hasHydrated: true,
    recordings,
    missingFilesPending: null,
    recoverFilesStatus: { status: 'done', recovered: [] },
    addRecording: (r) => set((s) => ({ recordings: [r, ...s.recordings] })),
    deleteRecording: async (id) =>
      set((s) => ({ recordings: s.recordings.filter((r) => r.id !== id) })),
    updateRecording: (id, data) =>
      set((s) => ({
        recordings: s.recordings.map((r) =>
          r.id === id ? { ...r, ...data } : r
        ),
      })),
  }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('subscribeToFileStatus', () => {
  it('joins the qr_token room once connected', () => {
    const { socket, fire, emit } = fakeSocket()
    subscribeToFileStatus('qr-1', () => socket, makeStore([]))
    fire('connect')
    expect(emit).toHaveBeenCalledWith('join', { qr_token: 'qr-1' })
  })

  it('mirrors pipeline statuses and the server message', () => {
    const { socket, fire } = fakeSocket()
    const store = makeStore([recording()])
    subscribeToFileStatus('qr', () => socket, store)
    fire('file_status', {
      file_id: 'file-1',
      status: 'scanning',
      message: 'Analyse antivirus',
    })
    expect(store.getState().recordings[0]).toMatchObject({
      serverStatus: 'scanning',
      serverStatusMessage: 'Analyse antivirus',
    })
    // An unknown status keeps the last known one.
    fire('file_status', { file_id: 'file-1', status: 'brand_new_step' })
    expect(store.getState().recordings[0].serverStatus).toBe('scanning')
  })

  it('removes the row a few seconds after a terminal success', () => {
    const { socket, fire } = fakeSocket()
    const store = makeStore([recording()])
    subscribeToFileStatus('qr', () => socket, store)
    fire('file_status', { file_id: 'file-1', status: 'kevent_completed' })
    expect(store.getState().recordings).toHaveLength(1)
    vi.advanceTimersByTime(REMOVE_AFTER_SUCCESS_MS)
    expect(store.getState().recordings).toHaveLength(0)
  })

  it('blocks the recording on a terminal server failure', () => {
    const { socket, fire } = fakeSocket()
    const store = makeStore([recording()])
    subscribeToFileStatus('qr', () => socket, store)
    fire('file_status', {
      file_id: 'file-1',
      status: 'scan_infected',
      message: 'Fichier infecté',
    })
    expect(store.getState().recordings[0]).toMatchObject({
      uploadingStatus: 'blocked',
      uploadBlockedReason: 'validation',
      serverStatusMessage: 'Fichier infecté',
    })
  })

  it('replays events received before the upload response', () => {
    const { socket, fire } = fakeSocket()
    const store = makeStore([
      recording({ serverFileId: undefined, uploadingStatus: 'uploading' }),
    ])
    subscribeToFileStatus('qr', () => socket, store)
    fire('file_status', { file_id: 'file-1', status: 'transcoding' })
    expect(store.getState().recordings[0].serverStatus).toBe('pending')

    store.getState().updateRecording('rec', {
      serverFileId: 'file-1',
      uploadingStatus: 'uploaded',
    })
    expect(store.getState().recordings[0].serverStatus).toBe('transcoding')
  })

  it('ignores incomplete events and cleans up', () => {
    const { socket, fire, disconnect } = fakeSocket()
    const store = makeStore([recording()])
    const cleanup = subscribeToFileStatus('qr', () => socket, store)
    fire('file_status', { status: 'scanning' })
    fire('file_status', { file_id: 'file-1' })
    expect(store.getState().recordings[0].serverStatus).toBe('pending')

    cleanup()
    expect(disconnect).toHaveBeenCalledOnce()
    // Buffered events are no longer replayed after cleanup.
    fire('file_status', { file_id: 'other', status: 'scanning' })
    store.getState().updateRecording('rec', { serverFileId: 'other' })
    expect(store.getState().recordings[0].serverStatus).toBe('pending')
  })
})
