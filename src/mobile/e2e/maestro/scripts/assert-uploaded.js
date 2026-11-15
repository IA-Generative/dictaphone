// Fails unless the mock DMZ received at least MIN_UPLOADS uploads (default 1)
// of at least MIN_BYTES bytes each (default 1).
var state = JSON.parse(http.get('http://localhost:4010/__e2e/state').body)
var minUploads = Number(typeof MIN_UPLOADS === 'undefined' ? 1 : MIN_UPLOADS)
var minBytes = Number(typeof MIN_BYTES === 'undefined' ? 1 : MIN_BYTES)
var big = state.uploads.filter(function (u) {
  return u.bytes >= minBytes
})
if (big.length < minUploads) {
  throw new Error(
    'Expected ' +
      minUploads +
      ' upload(s) >= ' +
      minBytes +
      ' bytes, got ' +
      JSON.stringify(state.uploads)
  )
}
