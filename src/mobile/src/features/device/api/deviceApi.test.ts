import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tokens = vi.hoisted(() => ({
  deviceToken: 'tok' as string | null,
  setDeviceToken: vi.fn(),
  setQrToken: vi.fn(),
}))

vi.mock('@/api/constants', () => ({ API_URL: 'https://dmz.example.test' }))
vi.mock('@/services/deviceTokenService', () => ({
  getDeviceToken: async () => tokens.deviceToken,
  getOrCreateDeviceKey: async () => 'abcdef0123',
  setDeviceToken: tokens.setDeviceToken,
  setQrToken: tokens.setQrToken,
}))
vi.mock('react-native-device-info', () => ({
  default: {
    getUniqueId: async () => 'unique-id',
    getModel: () => 'iPhone 17',
    getSystemVersion: () => '26.0',
    getBrand: () => 'Apple',
  },
}))

import { enrollDevice } from './enroll'
import { deviceHeartbeat } from './heartbeat'
import { resolveSimpleCode } from './resolveSimpleCode'
import { fetchDeviceSession } from './session'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  tokens.deviceToken = 'tok'
  tokens.setDeviceToken.mockReset()
  tokens.setQrToken.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('enrollDevice', () => {
  it('enrolls with the device key and stores the returned credentials', async () => {
    fetchMock.mockResolvedValue(json({ device_token: 'new-token' }))
    await enrollDevice('qr-1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://dmz.example.test/api/device/enroll/qr-1')
    expect(JSON.parse(init.body)).toMatchObject({
      device_key: 'abcdef0123',
      device_name: 'iPhone 17',
      device_fingerprint: 'unique-id|Apple|iPhone 17|26.0|native-ios',
    })
    expect(tokens.setDeviceToken).toHaveBeenCalledWith('new-token')
    expect(tokens.setQrToken).toHaveBeenCalledWith('qr-1')
  })

  it('surfaces the server message and stores nothing on failure', async () => {
    fetchMock.mockResolvedValue(json({ message: 'QR expiré' }, 410))
    await expect(enrollDevice('qr-1')).rejects.toThrow('QR expiré')
    fetchMock.mockResolvedValue(json({}, 200))
    await expect(enrollDevice('qr-1')).rejects.toThrow('HTTP 200')
    expect(tokens.setDeviceToken).not.toHaveBeenCalled()
  })
})

describe('deviceHeartbeat', () => {
  it('revalidates with the device token and rotates it when refreshed', async () => {
    fetchMock.mockResolvedValue(
      json({ valid: true, refreshed_device_token: 'rotated' })
    )
    await expect(deviceHeartbeat()).resolves.toMatchObject({ valid: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://dmz.example.test/api/device/heartbeat')
    expect(init.headers['X-Device-Token']).toBe('tok')
    expect(tokens.setDeviceToken).toHaveBeenCalledWith('rotated')
  })

  it('is a no-op without token and soft-fails on errors', async () => {
    tokens.deviceToken = null
    await expect(deviceHeartbeat()).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()

    tokens.deviceToken = 'tok'
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    await expect(deviceHeartbeat()).resolves.toBeNull()
    fetchMock.mockResolvedValueOnce(json({}, 401))
    await expect(deviceHeartbeat()).resolves.toBeNull()
    expect(tokens.setDeviceToken).not.toHaveBeenCalled()
  })
})

describe('fetchDeviceSession', () => {
  it('reads the session with the device token', async () => {
    fetchMock.mockResolvedValue(
      json({ status: 'enrolled', simple_code: 'AB12CD' })
    )
    await expect(fetchDeviceSession('qr-1')).resolves.toMatchObject({
      simple_code: 'AB12CD',
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://dmz.example.test/api/device/session/qr-1')
    expect(init.headers).toEqual({ 'X-Device-Token': 'tok' })
  })
})

describe('resolveSimpleCode', () => {
  const redirected = (url: string, status = 200) => {
    const response = new Response('', { status })
    Object.defineProperty(response, 'url', { value: url })
    return response
  }

  it('posts the normalized code and reads the qr_token from the redirect', async () => {
    fetchMock.mockResolvedValue(
      redirected('https://dmz.example.test/upload/qr_Token-9')
    )
    await expect(resolveSimpleCode(' ab12cd ')).resolves.toBe('qr_Token-9')
    expect(fetchMock.mock.calls[0][1].body).toBe('code=AB12CD')
  })

  it('returns null for unknown codes', async () => {
    await expect(resolveSimpleCode('   ')).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock.mockResolvedValue(redirected('https://dmz.example.test/', 200))
    await expect(resolveSimpleCode('ZZZZZZ')).resolves.toBeNull()
    fetchMock.mockResolvedValue(redirected('', 404))
    await expect(resolveSimpleCode('ZZZZZZ')).resolves.toBeNull()
  })
})
