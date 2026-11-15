import { ApiError, type ApiErrorRequest } from './ApiError'
import {
  isBlocked,
  parseRetryAfter,
  type RateLimitScope,
  recordRateLimit,
  useRateLimits,
} from './rateLimits'
import { getDeviceToken } from '@/services/deviceTokenService'
import { API_URL, BASE_URL } from '@/api/constants'

function buildHeaders(
  deviceToken: string | null,
  options?: RequestInit
): RequestInit['headers'] {
  return {
    'Content-Type': 'application/json',
    ...(deviceToken ? { 'X-Device-Token': deviceToken } : {}),
    Referer: BASE_URL,
    ...options?.headers,
  }
}

async function parseResponse<T>(
  response: Response,
  request: ApiErrorRequest,
  rateLimitScope?: RateLimitScope
): Promise<T> {
  const retryAt =
    response.status === 429
      ? parseRetryAfter(response.headers.get('Retry-After'))
      : null
  if (response.status === 429 && rateLimitScope) {
    recordRateLimit(rateLimitScope, retryAt)
  }

  let result = undefined as T
  try {
    if (response.status !== 204) {
      const contentType = response.headers.get('content-type') ?? ''
      if (
        contentType.startsWith('text/plain') ||
        contentType.includes('text/html')
      ) {
        result = (await response.text()) as T
      } else if (contentType.includes('application/json')) {
        result = (await response.json()) as T
      }
    }
  } catch (error) {
    // Preserve the HTTP status even when a proxy returns an invalid error body.
    if (response.ok) throw error
  }

  if (!response.ok) {
    throw new ApiError(response.status, result, retryAt, request)
  }
  return result
}

export const fetchApi = async <T = Record<string, unknown>>(
  url: string,
  {
    rateLimitScope,
    ...options
  }: RequestInit & { rateLimitScope?: RateLimitScope } = {}
): Promise<T> => {
  if (!url.startsWith('/')) {
    url = `/${url}`
  }
  const [pathname, suffix = ''] = url.split(/(?=[?#])/, 2)
  url = `${pathname.replace(/\/$/, '')}/${suffix}`
  const request = {
    method: (options.method ?? 'GET').toUpperCase(),
    path: `${url.split(/[?#]/, 1)[0]}${suffix.startsWith('?') ? '?[redacted]' : ''}`,
  }

  if (rateLimitScope) {
    // Don't send requests the server would reject anyway.
    const retryAt = useRateLimits.getState().cooldowns[rateLimitScope]
    if (isBlocked(retryAt)) throw new ApiError(429, undefined, retryAt, request)
  }

  // MIrAI fork: devices authenticate with a long-lived device_token (no
  // OAuth refresh flow), so a 401 is surfaced as-is.
  const token = await getDeviceToken()
  const response = await fetch(`${API_URL}${url}`, {
    ...options,
    headers: buildHeaders(token, options),
  })
  return parseResponse<T>(response, request, rateLimitScope)
}
