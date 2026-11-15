# RFC — Mobile: QR enrollment from an SSO session, and pluggable backends

> Status: **draft for discussion**. Nothing is wired yet. This document
> proposes principles and an incremental plan, and asks maintainers which
> parts they would accept upstream.

## 1. Context

Today the mobile app signs in through ProConnect: an in-app browser opens the
OIDC flow (PKCE), the backend exchanges the code and returns a SimpleJWT
access/refresh pair (`core/authentication/views.py`). That works well for
individual agents with ProConnect, but several deployments hit limits:

- **No usable SSO inside the phone.** Some ministries authenticate agents
  through an SSO that only exists on the workstation network or behind an
  authenticating reverse proxy. At the Ministry of the Interior this is
  *Passage2* (Apache + mod_auth_mellon, SAML, identity passed in headers). The
  phone cannot reach it, or cannot complete the flow in an in-app browser.
- **Managed or shared phones.** Typing credentials on a phone is slow and
  error-prone. Operations teams prefer to enroll a device once and to be able
  to revoke it from a web page.
- **Other backends.** The MIrAI program (`mes-réunions`) uses the same app with
  its own upload chain: a DMZ upload portal, antivirus, transcoding and
  transcription in an internal zone. It reuses the recorder, the upload queue
  and the UI, but talks to another API.

The MIrAI fork (IA-Generative/dictaphone) has implemented this since 2026-05.
This RFC extracts the principles so they can be discussed upstream instead of
living only in a fork.

## 2. Principles

1. **P1 — Enroll from where the user is already authenticated.** The phone does
   not sign in itself. A web page, opened in the user's existing SSO session,
   issues a short-lived **one-time** code. It is shown as a QR code plus a short
   code that can be typed by hand. Any SSO the web app supports works,
   including header-based ones like Passage2.
2. **P2 — A revocable credential per device.** Enrollment creates a `Device`
   bound to the user. The phone generates a random `device_key` that never
   leaves its Keychain/Keystore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). The
   credential it receives is bound to that key, can be listed and renamed, and
   is revoked from the web app ("My devices").
3. **P3 — Same API afterwards.** Once enrolled, the app gets ordinary
   short-lived access tokens. Uploads, transcripts and Docs integration do not
   change.
4. **P4 — No regression.** ProConnect sign-in stays the default. QR enrollment
   is an additional option that each deployment enables.
5. **P5 — Pluggable backend at three seams only.** When a deployment needs
   another backend, only three things vary: how requests are authenticated,
   how a file is uploaded, and how processing status is followed. The
   recorder, the queue, the retry and rate-limit logic and the UI stay shared.

## 3. Part A — QR enrollment for the dictaphone backend

Sequence: [mobile device enrollment](diagrams/mobile-device-enrollment-sequence.mmd).

### Backend (Django)

- `Device` model: `user`, `name`, `key_hash` (hash of the `device_key`),
  `created_at`, `last_seen_at`, `revoked_at`.
- `EnrollmentCode` model (or cache entry): random `qr_token` (32 bytes,
  URL-safe), `simple_code` (6 characters without ambiguous ones), `user`,
  `expires_at` (about 5 minutes), `consumed_at`.
- `POST /api/v1.0/devices/enrollment-codes/` (session or JWT): creates a code.
  Throttled per user.
- `POST /api/v1.0/devices/enroll/` (anonymous, throttled per IP like the PKCE
  exchange): `{qr_token | simple_code, device_key, device_name}`. It consumes
  the code atomically, creates the `Device` and returns a **SimpleJWT pair
  whose refresh token carries a `device_id` claim**.
- Refresh: same endpoint as today. It rejects tokens whose `device_id` is
  revoked or unknown, which requires the SimpleJWT blacklist or a check of the
  claim.
- `GET/PATCH/POST /api/v1.0/devices/…`: list, rename, revoke and revoke all
  for the current user.

Reusing SimpleJWT keeps the rest of the API untouched (P3). The `device_key` is
a second factor held by the device: the refresh request also sends the key,
and the server checks it against `key_hash`. A refresh token leaked without
the key is then useless.

### Web frontend

- "Add a device" dialog: QR code, simple code, countdown, and a QR refresh
  once it expires.
- "My devices" list: name, last activity, revoke.

### Mobile

- Login screen: "Scan a QR code" and "Enter a code" next to the ProConnect
  button. This needs `react-native-vision-camera` and an
  `NSCameraUsageDescription`.
- Store `device_key` and the tokens in the Keychain, as `authService` already
  does for the tokens.
- On a 401 at refresh time, return to the login screen as today.

### Security notes

- The `qr_token` is the only secret ever in a URL. It is single-use and
  short-lived. A screenshot of the QR code is worthless after use or expiry.
- Enrollment throttling (IP and user), plus the failed-request throttling
  already used by the PKCE token exchange.
- Credentials are bound to `device_key`, revocable, and auditable (the device
  list).
- Header-based SSO (Passage2): the web app must trust identity headers only
  from the proxy, with a shared secret header and/or source CIDR, and must
  refuse to start otherwise. A reference implementation exists (§5).

## 4. Part B — Pluggable backend in the mobile app

Only if maintainers want upstream to support non-dictaphone backends. The
alternative is to keep Part B in forks and accept only Part A.

```ts
// Sketch: src/mobile/src/backends/types.ts (not wired yet)
interface MobileBackend {
  id: 'dictaphone' | string
  auth: BackendAuth          // headers for API calls, refresh, logout, enroll
  upload: BackendUpload      // enqueue one recording, report progress, map errors
  status: BackendStatus      // follow processing (polling or push)
  capabilities: {
    qrEnrollment: boolean
    backgroundUpload: boolean // native background transfer available
    remoteRecordings: boolean // list/open transcripts in the app
    docsIntegration: boolean
  }
}
```

- `dictaphone` (default): today's code. OIDC PKCE plus optional QR enrollment
  (Part A), presigned S3 with the native background upload module, then status
  through `/files/` and `ai-jobs`.
- `mes-reunions` (example, MIrAI fork): QR enrollment against the DMZ,
  `X-Device-Token` header, multipart `POST /api/upload/<qr_token>`, then status
  pushed over Socket.IO (`file_status` events in a room per `qr_token`).
- **Backend selection.** At build time (environment variable or flavor), or
  from the QR code: its host must belong to the app's allowlist. Never trust
  an arbitrary host taken from a QR code.
- **Error contract.** Every adapter rejects with `ApiError(status, body,
  retryAt)`, so the existing upload manager (`uploadRetry.ts`: backoff, `blocked`
  reasons, 429 cooldowns) works unchanged. This is already how the MIrAI
  adapter behaves.

## 5. Reference implementations

- **Mobile, MIrAI fork** (IA-Generative/dictaphone, branch `mirai-audio`): QR
  and code enrollment (`screens/QrScanScreen.tsx`, `CodeEntryScreen.tsx`,
  `features/device/*`), device token in the Keychain with heartbeat, DMZ
  multipart upload mapped to `ApiError`, and Socket.IO status
  (`features/pipeline/fileStatusSocket.ts`). Resync with upstream v0.16.0 is
  in progress.
- **QR portal behind Passage2** (IA-Generative/mirai-mesreunions,
  `services/qr-enrollment-portal`): standalone web page that reads the Mellon
  headers only from the trusted proxy (secret and/or CIDR, refuses to start
  otherwise), resolves the user by e-mail to the Keycloak account, issues the
  enrollment code, and lists or revokes devices.
- **End-to-end bench** (fork, `src/mobile/e2e`): a mock backend with the same
  contract and Maestro flows. They cover enrollment by code, upload and status,
  401 with retry, 429 with automatic resume, and a detected virus. They run in
  CI on an iOS simulator.

## 6. Incremental plan

1. Agree on Part A and the backend endpoints (this RFC).
2. Backend: `Device`, `EnrollmentCode`, endpoints, refresh check, tests.
3. Web: "Add a device" and "My devices".
4. Mobile: QR and code screens behind a `config.mobile_app.qr_enrollment` flag
   served by `/config/`.
5. Optional: Part B seams, one PR per seam (auth, then upload, then status),
   each without behaviour change for the `dictaphone` backend.

## 7. Open questions for maintainers

1. Is QR enrollment (Part A) welcome upstream, and behind which flag: per
   deployment, or per user group?
2. SimpleJWT with a `device_id` claim, or a separate opaque device token?
3. Should `device_key` be checked at every refresh (stronger, one more
   round-trip), or only at enrollment?
4. Part B: upstream abstraction, or keep alternative backends in forks?
5. Lifetime defaults: enrollment code TTL, refresh lifetime for devices, and
   whether to add an inactivity revocation.
