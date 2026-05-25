import { ApiError } from './ApiError'
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
  response: Response
): Promise<{ response: Response; result: T }> {
  let result: T
  if (response.status === 204) {
    result = undefined as T
  } else {
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType === 'text/plain' || contentType.includes('text/html')) {
      result = (await response.text()) as T
    } else if (!contentType.includes('application/json')) {
      result = undefined as T
    } else {
      result = (await response.json()) as T
    }
  }

  return { response, result }
}

export const fetchApi = async <T = Record<string, unknown>>(
  url: string,
  options?: RequestInit
): Promise<T> => {
  if (!url.startsWith('/')) {
    url = `/${url}`
  }

  const token = await getDeviceToken()
  const { response, result } = await parseResponse<T>(
    await fetch(`${API_URL}${url}`, {
      ...options,
      headers: buildHeaders(token, options),
    })
  )

  if (!response.ok) {
    throw new ApiError(response.status, result)
  }
  return result
}
