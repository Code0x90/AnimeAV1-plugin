const assert = require('node:assert/strict')
const path = require('node:path')
const providerPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'src', 'animeav1', 'index.js')
function response(data, status = 200, contentType = 'application/json') {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => contentType }, json: async () => data, text: async () => typeof data === 'string' ? data : JSON.stringify(data) }
}
function sourceData(playUrl) {
  return { nodes: [{ data: [{ embeds: 1 }, { SUB: 2 }, [{ server: 3, url: 4 }], 'HLS', playUrl] }] }
}
async function runTest(title, setup, tmdbId, type, expectedUrl, expectedRoutes) {
  delete require.cache[require.resolve(providerPath)]
  const requested = []
  global.fetch = async (url) => {
    const u = String(url); requested.push(u)
    return setup(u)
  }
  const provider = require(providerPath)
  const streams = await provider.getStreams(tmdbId, type, type === 'movie' ? 1 : 1, 1)
  assert.equal(streams.length, 1, `${title}: expected one stream`)
  assert.equal(streams[0].url, expectedUrl, `${title}: wrong stream URL`)
  for (const route of expectedRoutes) assert.equal(requested.some((u) => u.includes(route)), true, `${title}: missing route ${route}`)
  return requested
}
async function main() {
  const movieSlug = 'kidou-senshi-gundam-senkou-no-hathaway-circe-no-majo'
  const commonResolver = (slug, title) => response({ success: true, slug, animeav1Title: title, score: 50, matchType: 'tmdb-alternative' })

  let routes = await runTest('movie episode zero first', (u) => {
    if (u.includes('/resolve?')) return commonResolver(movieSlug, 'Kidou Senshi Gundam: Senkou no Hathaway - Circe no Majo')
    if (u.includes(`/media/${movieSlug}/0/__data.json`)) return response(sourceData('https://player.zilla-networks.com/play/gundam-test'))
    throw new Error('Unexpected fetch: ' + u)
  }, '910850', 'movie', 'https://player.zilla-networks.com/m3u8/gundam-test', [`/media/${movieSlug}/0/__data.json`])
  assert.equal(routes.some((u) => u.includes(`/media/${movieSlug}/1/__data.json`)), false, 'episode 1 must not be queried if episode 0 succeeds')
  console.log('MOVIE_EPISODE_ZERO_FIRST=PASS')

  routes = await runTest('empty episode zero falls back to one', (u) => {
    if (u.includes('/resolve?')) return commonResolver('test-movie', 'Test movie')
    if (u.includes('/media/test-movie/0/__data.json')) return response(sourceData('https://player.zilla-networks.com/play/'))
    if (u === 'https://animeav1.com/media/test-movie/0') return response('<html></html>', 200, 'text/html')
    if (u.includes('/media/test-movie/1/__data.json')) return response(sourceData('https://player.zilla-networks.com/play/working-id'))
    throw new Error('Unexpected fetch: ' + u)
  }, '999999', 'movie', 'https://player.zilla-networks.com/m3u8/working-id', ['/media/test-movie/0/__data.json', '/media/test-movie/1/__data.json'])
  console.log('EMPTY_MOVIE_EPISODE_ZERO_FALLBACK_TO_ONE=PASS')

  routes = await runTest('TV episode route unchanged', (u) => {
    if (u.includes('/resolve?')) return response({ success: true, slug: 'test-tv', animeav1Title: 'Test TV', score: 90 })
    if (u.includes('/media/test-tv/1/__data.json')) return response(sourceData('https://player.zilla-networks.com/play/tv-episode-1'))
    throw new Error('Unexpected fetch: ' + u)
  }, '123456', 'tv', 'https://player.zilla-networks.com/m3u8/tv-episode-1', ['/media/test-tv/1/__data.json'])
  assert.equal(routes.some((u) => u.includes('/media/test-tv/0/__data.json')), false, 'TV episodes must not probe episode 0')
  console.log('TV_EPISODE_ROUTE_UNCHANGED=PASS')
}
main().catch((e) => { console.error(e.stack || e); process.exit(1) })
