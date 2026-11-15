// MIrAI mes-réunions DMZ upload portal host (mobile-upload-pwa service).
// Admin/portal lives on mesreunions.numerique-interieur.com.
// MIRAI_API_URL is inlined at bundle time (babel) for end-to-end builds that
// target the mock DMZ; it is never set for store builds.
export const BASE_URL =
  process.env.MIRAI_API_URL || 'https://depot.numerique-interieur.com'
export const API_URL = BASE_URL
export const MOCK_DATA = false
