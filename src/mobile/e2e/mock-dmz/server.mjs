// Mock of the mes-réunions DMZ (mobile-upload-pwa) for end-to-end tests.
//
// Implements only what the MIrAI app calls, with the same paths, headers and
// payload shapes as services/mobile-upload-pwa/app/main.py:
//   POST /code                       simple code → 302 /upload/<qr_token>
//   GET  /upload/:qr                 landing page (target of the redirect)
//   POST /api/device/enroll/:qr      → { device_token, retention_until }
//   GET  /api/device/session/:qr     → session info (X-Device-Token)
//   POST /api/device/heartbeat       → { valid }
//   POST /api/upload/:qr             multipart upload (X-Device-Token)
//   Socket.IO `join` {qr_token}      then `file_status` events per upload
// Test helpers:
//   GET  /__e2e/state                uploads and enrollments seen so far
//   POST /__e2e/reset                forget everything (scenario included)
//   POST /__e2e/scenario             { uploadFailures, uploadStatus,
//                                      uploadError, retryAfter, pipeline }
//     The next `uploadFailures` uploads get `uploadStatus` (+ Retry-After
//     when `retryAfter` is set) and { error: uploadError }, then uploads
//     succeed. pipeline: "ok" (default) or "infected" (virus found).
//
// Env: PORT (4010), E2E_SIMPLE_CODE (E2E123), E2E_QR_TOKEN,
//      E2E_STEP_MS (delay between pipeline statuses, 2000),
//      E2E_UPLOAD_STATUS (HTTP status forced on uploads, unset = 200),
//      E2E_FINAL_STATUS (kevent_completed).
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Server } from 'socket.io'

const PORT = Number(process.env.PORT ?? 4010)
const SIMPLE_CODE = (process.env.E2E_SIMPLE_CODE ?? 'E2E123').toUpperCase()
const QR_TOKEN = process.env.E2E_QR_TOKEN ?? 'e2e_qr_token_0123456789'
const STEP_MS = Number(process.env.E2E_STEP_MS ?? 2000)
const FORCED_UPLOAD_STATUS = Number(process.env.E2E_UPLOAD_STATUS ?? 0)
const FINAL_STATUS = process.env.E2E_FINAL_STATUS ?? 'kevent_completed'
const PIPELINES = {
  ok: ['scanning', 'scan_clean', 'transcoding', 'transferred', FINAL_STATUS],
  infected: ['scanning', 'scan_infected'],
}
const STATUS_MESSAGES = {
  [FINAL_STATUS]: 'Disponible dans mes-réunions',
  scan_infected: 'Fichier infecté (EICAR-Test-File)',
}
const DEFAULT_SCENARIO = {
  uploadFailures: 0,
  uploadStatus: 500,
  uploadError: '',
  retryAfter: null,
  pipeline: 'ok',
}
let scenario = { ...DEFAULT_SCENARIO }

const SESSION_EXPIRES_AT = new Date(Date.now() + 7 * 86400_000).toISOString()
const newState = () => ({
  enrollments: [],
  uploads: [],
  rejectedUploads: 0,
  heartbeats: 0,
  sessionCalls: 0,
})
let state = newState()
const deviceTokens = new Set()

const send = (res, status, body, headers = {}) => {
  const isJson = typeof body !== 'string'
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json' : 'text/html; charset=utf-8',
    ...headers,
  })
  res.end(isJson ? JSON.stringify(body) : body)
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

const authorized = (req) => deviceTokens.has(req.headers['x-device-token'])

const multipartFilename = (body, contentType) => {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType ?? '')
  if (!boundary) return null
  const header =
    body.toString('utf8').split(`--${boundary[1] ?? boundary[2]}`)[1] ?? ''
  return /filename="([^"]*)"/.exec(header)?.[1] ?? null
}

const io = new Server({ cors: { origin: '*' } })

const runPipeline = (fileId, filename, pipeline) => {
  ;(PIPELINES[pipeline] ?? PIPELINES.ok).forEach((status, i) => {
    setTimeout(
      () => {
        io.to(QR_TOKEN).emit('file_status', {
          file_id: fileId,
          name: filename,
          status,
          message: STATUS_MESSAGES[status] ?? '',
        })
      },
      STEP_MS * (i + 1)
    )
  })
}

const routes = async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname
  const qr =
    /^\/(?:api\/device\/(?:enroll|session)|api\/upload|upload)\/([^/]+)$/.exec(
      path
    )?.[1]

  if (req.method === 'POST' && path === '/code') {
    const code = new URLSearchParams((await readBody(req)).toString()).get(
      'code'
    )
    if ((code ?? '').trim().toUpperCase() === SIMPLE_CODE) {
      return send(res, 302, '', { Location: `/upload/${QR_TOKEN}` })
    }
    return send(res, 200, '<p>Code invalide</p>')
  }

  if (req.method === 'GET' && path.startsWith('/upload/')) {
    return send(res, 200, '<p>Upload</p>')
  }

  if (req.method === 'POST' && path.startsWith('/api/device/enroll/')) {
    if (qr !== QR_TOKEN) return send(res, 404, { error: 'unknown_qr_token' })
    const payload = JSON.parse((await readBody(req)).toString() || '{}')
    if (!/^[0-9a-f]{1,64}$/.test(payload.device_key ?? '')) {
      return send(res, 400, { error: 'invalid_device_key' })
    }
    const deviceToken = `e2e-device-${randomUUID()}`
    deviceTokens.add(deviceToken)
    state.enrollments.push({ device_name: payload.device_name, at: Date.now() })
    return send(res, 200, {
      device_token: deviceToken,
      retention_until: Math.floor(Date.now() / 1000) + 7 * 86400,
    })
  }

  if (req.method === 'GET' && path.startsWith('/api/device/session/')) {
    state.sessionCalls += 1
    const enrolled = authorized(req)
    return send(res, 200, {
      status: enrolled ? 'enrolled' : 'needs_enrollment',
      can_upload: enrolled,
      can_view: enrolled,
      simple_code: SIMPLE_CODE,
      expires_at: SESSION_EXPIRES_AT,
      revalidate_interval_seconds: 3600,
      max_validation_failure_seconds: 14400,
    })
  }

  if (req.method === 'POST' && path === '/api/device/heartbeat') {
    state.heartbeats += 1
    return authorized(req)
      ? send(res, 200, { valid: true, refreshed_device_token: null })
      : send(res, 401, { valid: false, error: 'invalid_device_token' })
  }

  if (req.method === 'POST' && path.startsWith('/api/upload/')) {
    const body = await readBody(req)
    if (!authorized(req))
      return send(res, 401, { error: 'Appareil non autorisé' })
    if (qr !== QR_TOKEN) return send(res, 404, { error: 'Session inconnue' })
    if (scenario.uploadFailures > 0) {
      scenario.uploadFailures -= 1
      state.rejectedUploads += 1
      return send(
        res,
        scenario.uploadStatus,
        {
          error:
            scenario.uploadError || `Erreur simulée ${scenario.uploadStatus}`,
        },
        scenario.retryAfter
          ? { 'Retry-After': String(scenario.retryAfter) }
          : {}
      )
    }
    if (FORCED_UPLOAD_STATUS) {
      return send(res, FORCED_UPLOAD_STATUS, {
        error: `Erreur simulée ${FORCED_UPLOAD_STATUS}`,
      })
    }
    const filename =
      multipartFilename(body, req.headers['content-type']) ?? 'audio.m4a'
    const fileId = randomUUID()
    state.uploads.push({
      file_id: fileId,
      filename,
      bytes: body.length,
      at: Date.now(),
    })
    runPipeline(fileId, filename, scenario.pipeline)
    return send(res, 200, { file_id: fileId, filename, status: 'pending' })
  }

  if (req.method === 'GET' && path === '/__e2e/state')
    return send(res, 200, { ...state, scenario })
  if (req.method === 'POST' && path === '/__e2e/reset') {
    state = newState()
    scenario = { ...DEFAULT_SCENARIO }
    deviceTokens.clear()
    return send(res, 204, '')
  }
  if (req.method === 'POST' && path === '/__e2e/scenario') {
    scenario = {
      ...DEFAULT_SCENARIO,
      ...JSON.parse((await readBody(req)).toString() || '{}'),
    }
    return send(res, 200, scenario)
  }
  if (req.method === 'GET' && path === '/healthz')
    return send(res, 200, { status: 'ok' })

  return send(res, 404, { error: 'not_found' })
}

const server = createServer((req, res) => {
  if (req.url?.startsWith('/socket.io/')) return // handled by Socket.IO
  res.on('finish', () => {
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.url} -> ${res.statusCode}`
    )
  })
  routes(req, res).catch((error) => {
    console.error(error)
    send(res, 500, { error: 'mock_failure' })
  })
})

io.attach(server)
io.on('connection', (socket) => {
  console.log(`${new Date().toISOString()} socket connected ${socket.id}`)
  socket.on('join', ({ qr_token: qrToken } = {}) => {
    console.log(`${new Date().toISOString()} socket join ${qrToken}`)
    if (qrToken) socket.join(qrToken)
  })
})

server.listen(PORT, () => {
  console.log(
    `mock DMZ listening on http://localhost:${PORT} (code ${SIMPLE_CODE})`
  )
})
