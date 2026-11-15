// Resets the mock DMZ, then applies SCENARIO (JSON, see
// e2e/mock-dmz/server.mjs). Run at the start of every flow so flows do not
// depend on each other.
var base = 'http://localhost:4010'
http.post(base + '/__e2e/reset', { body: '' })
var response = http.post(base + '/__e2e/scenario', {
  headers: { 'Content-Type': 'application/json' },
  body: typeof SCENARIO === 'undefined' ? '{}' : SCENARIO,
})
if (response.status !== 200) {
  throw new Error('Mock DMZ scenario not applied: HTTP ' + response.status)
}
