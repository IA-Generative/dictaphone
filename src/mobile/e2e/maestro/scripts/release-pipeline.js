// Starts the pipelines the mock DMZ is holding (see set-scenario.js).
var response = http.post('http://localhost:4010/__e2e/release-pipeline', {
  body: '',
})
if (response.status !== 200) {
  throw new Error('Pipeline not released: HTTP ' + response.status)
}
