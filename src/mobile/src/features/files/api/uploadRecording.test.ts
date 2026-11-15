import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  token: 'device-token' as string | null,
  enrollment: { qrToken: 'qr-123', enrolledAtTs: 0 } as {
    qrToken: string
    enrolledAtTs: number
  } | null,
}))

vi.mock('@/api/constants', () => ({ API_URL: 'https://dmz.example.test' }))
vi.mock('@/services/deviceTokenService', () => ({
  getDeviceToken: async () => mocks.token,
}))
vi.mock('@/features/device/store', () => ({
  useDeviceStore: { getState: () => ({ enrollment: mocks.enrollment }) },
}))

import { ApiError } from '@/api/ApiError'
import { clearRateLimits, useRateLimits } from '@/api/rateLimits'
import {
  guessMimeType,
  sanitizeFilename,
  uploadRecordingToMirai,
} from './uploadRecording'

class FakeXhr {
  static last: FakeXhr
  method = ''
  url = ''
  headers: Record<string, string> = {}
  status = 0
  readyState = 0
  responseText = ''
  responseHeaders: Record<string, string> = {}
  body: unknown
  upload: { onprogress?: (e: ProgressEvent) => void } = {}
  onload?: () => void
  onerror?: () => void
  ontimeout?: () => void
  constructor() {
    FakeXhr.last = this
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  getResponseHeader(name: string) {
    return this.responseHeaders[name] ?? null
  }
  send(body: unknown) {
    this.body = body
  }
  respond(status: number, body: unknown, headers: Record<string, string> = {}) {
    this.status = status
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body)
    this.responseHeaders = headers
    this.onload?.()
  }
}

const start = (filename = 'Réunion budget.m4a') =>
  uploadRecordingToMirai({ filePath: '/docs/rec.m4a', filename })

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  clearRateLimits()
  mocks.token = 'device-token'
  mocks.enrollment = { qrToken: 'qr-123', enrolledAtTs: 0 }
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const sent = async () => {
  // Let the async token lookup run before the request is sent.
  await vi.waitFor(() => expect(FakeXhr.last?.body).toBeDefined())
  return FakeXhr.last
}

describe('uploadRecordingToMirai', () => {
  it('posts the file to the qr_token upload endpoint with the device token', async () => {
    const promise = start()
    const xhr = await sent()
    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe('https://dmz.example.test/api/upload/qr-123')
    expect(xhr.headers['X-Device-Token']).toBe('device-token')
    xhr.respond(200, { file_id: 'f1', filename: 'x', status: 'pending' })
    await expect(promise).resolves.toMatchObject({ file_id: 'f1' })
  })

  it('reports upload progress', async () => {
    const onProgress = vi.fn()
    const promise = uploadRecordingToMirai({
      filePath: 'file:///rec.m4a',
      filename: 'a.m4a',
      onProgress,
    })
    const xhr = await sent()
    xhr.upload.onprogress?.({
      lengthComputable: true,
      loaded: 25,
      total: 100,
    } as ProgressEvent)
    expect(onProgress).toHaveBeenCalledWith({
      uploadedBytes: 25,
      totalBytes: 100,
      progress: 0.25,
      percentage: 25,
    })
    xhr.respond(200, { file_id: 'f1' })
    await promise
  })

  it('rejects with an ApiError carrying the server reason', async () => {
    const promise = start()
    ;(await sent()).respond(401, { error: 'Jeton expiré, renouvelez-le.' })
    const error = await promise.catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      statusCode: 401,
      message: 'Jeton expiré, renouvelez-le.',
    })
  })

  it('keeps the HTTP status when the error body is not JSON', async () => {
    const promise = start()
    ;(await sent()).respond(502, '<html>Bad gateway</html>')
    await expect(promise).rejects.toMatchObject({ statusCode: 502 })
  })

  it('records the upload cooldown on 429', async () => {
    const promise = start()
    ;(await sent()).respond(429, {}, { 'Retry-After': '120' })
    const error = await promise.catch((e) => e)
    expect(error.statusCode).toBe(429)
    expect(error.retryAt).toBeGreaterThan(Date.now() + 100_000)
    expect(useRateLimits.getState().cooldowns.upload).toBe(error.retryAt)
  })

  it('rejects on network errors and invalid success bodies', async () => {
    const first = start()
    ;(await sent()).onerror?.()
    await expect(first).rejects.toThrow('Network error during upload')

    FakeXhr.last = undefined as unknown as FakeXhr
    const second = start()
    ;(await sent()).respond(200, 'not json')
    await expect(second).rejects.toThrow('Invalid JSON response from upload')
  })

  it('refuses to upload without enrollment or token', async () => {
    mocks.enrollment = null
    await expect(start()).rejects.toThrow('Device not enrolled')
    mocks.enrollment = { qrToken: 'qr', enrolledAtTs: 0 }
    mocks.token = null
    await expect(start()).rejects.toThrow('Missing device token')
  })
})

describe('filename helpers', () => {
  it('sanitizes names to readable ASCII', () => {
    expect(sanitizeFilename('Réunion d’équipe : budget 2027.m4a')).toBe(
      'Reunion_dequipe_budget_2027.m4a'
    )
    expect(sanitizeFilename('日本語')).toBe('audio.m4a')
    expect(sanitizeFilename('a'.repeat(300))).toHaveLength(200)
  })

  it('guesses the MIME type from the extension', () => {
    expect(guessMimeType('a.MP3')).toBe('audio/mpeg')
    expect(guessMimeType('a.wav')).toBe('audio/wav')
    expect(guessMimeType('a.caf')).toBe('audio/x-caf')
    expect(guessMimeType('noext')).toBe('audio/mp4')
  })
})
