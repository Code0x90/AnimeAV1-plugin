// providers/animeav1.js
// Provider Nuvio para AnimeAV1 (https://animeav1.com)
// Único source: MP4Upload (sin HLS/zilla-networks — bloqueado por Cloudflare a nivel de segmentos)
//
// Contrato Nuvio: exports.getStreams(tmdbId, type, season, episode) -> Promise<Array<Stream>>
// Stream: { name, title, url, quality, headers? }

const cheerio = require("cheerio-without-node-native")

const ANIMEAV1_BASE = "https://animeav1.com"
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c" // misma key pública usada en PeliSeriesHoy
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// Servidores soportados: nombre tal como aparece en el HTML/__data.json de
// AnimeAV1 -> función extractora que resuelve el link directo reproducible.
// Para sumar un nuevo source: 1) agregar su extractor más abajo, 2) agregarlo aquí.
const SOURCE_EXTRACTORS = {} // se completa al final del archivo, una vez definidos los extractores

// ─────────────────────────────────────────────
// TMDB → título de búsqueda
// ─────────────────────────────────────────────

/**
 * Obtiene el título (en inglés, más fiable para buscar en AnimeAV1) y el año
 * a partir de un ID de TMDB.
 * @param {string|number} tmdbId
 * @param {string} type - "movie" | "tv"
 * @returns {Promise<{title: string, year: number|undefined}|null>}
 */
async function getTMDBInfo(tmdbId, type) {
  const path = type === "movie" ? "movie" : "tv"
  const url = `https://api.themoviedb.org/3/${path}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`
  const data = await fetch(url, { headers: { "User-Agent": UA } }).then((r) => r.json())
  if (!data || data.success === false) return null
  const title = data.title || data.name || data.original_title || data.original_name
  const dateStr = data.release_date || data.first_air_date
  const year = dateStr ? new Date(dateStr).getFullYear() : undefined
  if (!title) return null
  return { title, year }
}

// ─────────────────────────────────────────────
// Búsqueda en AnimeAV1 (con fallbacks, igual que el addon original)
// ─────────────────────────────────────────────

function sanitizeQuery(query) {
  return query
    .replace(/[-–—]/g, ' ')
    .replace(/['"  \u2018\u2019\u201c\u201d`´]/g, ' ')
    .replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSearchURL(query, page, year) {
  const params = new URLSearchParams()
  if (query) params.set('search', query)
  if (year) { params.set('minYear', year); params.set('maxYear', year) }
  if (page) params.set('page', page)
  return `${ANIMEAV1_BASE}/catalogo?${params.toString()}`
}

/**
 * Descarga y parsea el HTML del catálogo/búsqueda de AnimeAV1 con cheerio.
 * (Adaptado 1:1 del addon original — AnimeAV1 no expone el catálogo vía __data.json
 * de forma fiable, así que aquí se usa scraping HTML directo.)
 */
async function searchAnimesBySpecificURL(url) {
  const html = await fetch(url, { headers: { "User-Agent": UA } }).then((resp) => {
    if (!resp.ok) throw Error(`HTTP error! Status: ${resp.status}`)
    return resp.text()
  })
  const $ = cheerio.load(html)

  const selectedElement = $("body > div > div.container > main > section > div > article")
  const media = []
  selectedElement.each((_, el) => {
    const href = $(el).find("a").attr("href")
    if (!href) return
    media.push({
      title: $(el).find("header > h3").text(),
      cover: $(el).find("div > figure > img").attr("src"),
      synopsis: $(el).find("div > div > div > p").eq(1).text(),
      slug: href.replace("/media/", ""),
      type: $(el).find("div > figure + div > div").text()
    })
  })

  return { media }
}

/**
 * Busca un anime en AnimeAV1 probando: query original, sanitizada, primeras 3 palabras.
 * @returns {Promise<Array>}
 */
async function searchAnimeAV1(query, year) {
  const runSearch = async (searchQuery) => {
    const searchURL = buildSearchURL(searchQuery, undefined, year)
    console.log(`[AnimeAV1] Buscando: ${searchURL}`)
    const data = await searchAnimesBySpecificURL(searchURL)
    if (!data?.media?.length) throw Error("No search results!")
    return data.media
  }

  try {
    return await runSearch(query)
  } catch (e) {
    if (e.message !== "No search results!") throw e
  }

  const sanitized = sanitizeQuery(query)
  if (sanitized && sanitized !== query) {
    try {
      return await runSearch(sanitized)
    } catch (e) {
      if (e.message !== "No search results!") throw e
    }
  }

  const base = sanitized || query
  const firstWords = base.split(' ').filter(Boolean).slice(0, 3).join(' ')
  if (firstWords && firstWords !== base) {
    try {
      return await runSearch(firstWords)
    } catch (e) {
      if (e.message !== "No search results!") throw e
    }
  }

  throw Error("No search results!")
}

/**
 * Elige el mejor candidato de una lista de resultados de búsqueda, comparando
 * similitud simple de título (substring / igualdad normalizada).
 */
function pickBestMatch(candidates, title) {
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const target = norm(title)
  let best = candidates.find(c => norm(c.title) === target)
  if (best) return best
  best = candidates.find(c => norm(c.title).includes(target) || target.includes(norm(c.title)))
  if (best) return best
  return candidates[0]
}

// ─────────────────────────────────────────────
// Extracción de servidores del episodio (__data.json + fallback HTML)
// ─────────────────────────────────────────────

/**
 * Obtiene la lista de servidores (embeds SUB/DUB) de un episodio dado.
 * Solo nos interesa el servidor "MP4Upload".
 */
async function getEpisodeServers(slug, epNumber) {
  const ep = (epNumber !== undefined && epNumber !== null) ? Number(epNumber) : 1
  const pageUrl = `${ANIMEAV1_BASE}/media/${slug}/${ep}`
  console.log(`[AnimeAV1] GetEpisodeServers: ${pageUrl}`)

  // ── Método primario: __data.json ──────────────────────────────────────
  try {
    const jsonUrl = `${pageUrl}/__data.json`
    const resp = await fetch(jsonUrl, { headers: { "User-Agent": UA, "Referer": ANIMEAV1_BASE + "/" } })
    if (!resp.ok) throw Error(`HTTP error! Status: ${resp.status}`)
    const root = await resp.json()

    const nodes = root?.nodes
    if (!Array.isArray(nodes)) throw Error("No nodes in __data.json")

    let dataArray = null
    for (const node of nodes) {
      if (node?.data && Array.isArray(node.data)) {
        const hasEmbeds = node.data.some(d => d && typeof d === 'object' && 'embeds' in d)
        if (hasEmbeds) { dataArray = node.data; break }
      }
    }
    if (!dataArray) throw Error("No data array with embeds found")

    const episodeObj = dataArray.find(d => d && typeof d === 'object' && 'embeds' in d)
    if (!episodeObj) throw Error("No episode object found")

    const embedsIndex = episodeObj.embeds
    const embeds = dataArray[embedsIndex]
    if (!embeds || typeof embeds !== 'object') throw Error("No embeds object")

    const servers = []

    function resolveServer(objIndex) {
      try {
        const obj = dataArray[objIndex]
        if (!obj || typeof obj !== 'object') return null
        const serverName = dataArray[obj.server]
        const url = dataArray[obj.url]
        if (typeof serverName !== 'string' || typeof url !== 'string') return null
        return { name: serverName, url }
      } catch (_) { return null }
    }

    function matchesSupportedSource(name) {
      return Object.keys(SOURCE_EXTRACTORS).some((key) => name.includes(key))
    }

    function extractServers(listIndex, dub) {
      const list = dataArray[listIndex]
      if (!Array.isArray(list)) return
      for (const objIndex of list) {
        const server = resolveServer(objIndex)
        if (!server || !server.url.startsWith('http')) continue
        if (!matchesSupportedSource(server.name)) continue // ── solo sources soportados ──
        servers.push({ name: server.name, url: server.url, dub })
      }
    }

    const subIndex = embeds.SUB ?? embeds.sub ?? -1
    const dubIndex = embeds.DUB ?? embeds.dub ?? -1
    if (subIndex >= 0) extractServers(subIndex, false)
    if (dubIndex >= 0) extractServers(dubIndex, true)

    // Algunos episodios exponen sources como "download" en vez de "embed"
    const downloadsIndex = episodeObj.downloads
    if (downloadsIndex !== undefined) {
      const downloads = dataArray[downloadsIndex]
      if (downloads && typeof downloads === 'object') {
        const dlSubIndex = downloads.SUB ?? downloads.sub ?? -1
        const dlDubIndex = downloads.DUB ?? downloads.dub ?? -1
        if (dlSubIndex >= 0) extractServers(dlSubIndex, false)
        if (dlDubIndex >= 0) extractServers(dlDubIndex, true)
      }
    }

    if (servers.length > 0) {
      console.log(`[AnimeAV1] __data.json OK: ${servers.length} servidores soportados`)
      return servers
    }
    throw Error("__data.json returned 0 servidores soportados, falling back")

  } catch (e) {
    console.warn(`[AnimeAV1] __data.json falló (${e.message}), probando HTML scraping`)
  }

  // ── Método de respaldo: scraping HTML ──────────────────────────────────
  try {
    const html = await fetch(pageUrl, { headers: { "User-Agent": UA } }).then((resp) => {
      if (!resp.ok) throw Error(`HTTP error! Status: ${resp.status}`)
      return resp.text()
    })
    const $ = cheerio.load(html)
    const scripts = $("script")
    const metadataJSON = scripts.map((_, el) => $(el).html()).get().find(s => s?.includes("kit.start(app, element, {"))

    const serversObj = metadataJSON?.match(/embeds:\s?.*?SUB:\s?(\[.*?\])/)?.[1]
    const serversObjDUB = metadataJSON?.match(/embeds:\s?.*?DUB:\s?(\[.*?\])/)?.[1]
    const downloadObj = metadataJSON?.match(/downloads:\s?.*?SUB:\s?(\[.*?\])/)?.[1]
    const downloadObjDUB = metadataJSON?.match(/downloads:\s?.*?DUB:\s?(\[.*?\])/)?.[1]

    let raw = []
    if (serversObj) raw = raw.concat(serversObj.split("},").map(s => ({ title: s.match(/server:\s?"(.*?)"/)?.[1], code: s.match(/url:\s?"(.*?)"/)?.[1], dub: false })))
    if (downloadObj) raw = raw.concat(downloadObj.split("},").map(s => ({ title: s.match(/server:\s?"(.*?)"/)?.[1], code: s.match(/url:\s?"(.*?)"/)?.[1], dub: false })))
    if (serversObjDUB) raw = raw.concat(serversObjDUB.split("},").map(s => ({ title: s.match(/server:\s?"(.*?)"/)?.[1], code: s.match(/url:\s?"(.*?)"/)?.[1], dub: true })))
    if (downloadObjDUB) raw = raw.concat(downloadObjDUB.split("},").map(s => ({ title: s.match(/server:\s?"(.*?)"/)?.[1], code: s.match(/url:\s?"(.*?)"/)?.[1], dub: true })))

    const servers = raw
      .filter(s => s.title && Object.keys(SOURCE_EXTRACTORS).some((key) => s.title.includes(key)) && s.code)
      .map(s => ({ name: s.title, url: s.code, dub: s.dub }))

    console.log(`[AnimeAV1] HTML scraping OK: ${servers.length} servidores soportados`)
    return servers
  } catch (e) {
    console.error("[AnimeAV1] Error en fallback HTML:", e.message)
    return []
  }
}

// ─────────────────────────────────────────────
// Extractores por source: cada uno recibe la URL de embed/download que
// devolvió AnimeAV1 y resuelve el link directo reproducible + sus headers.
// Cada extractor devuelve { url, headers }.
// ─────────────────────────────────────────────

/**
 * MP4Upload (https://www.mp4upload.com/embed-xxxx.html)
 * Extrae la URL directa del .mp4 parseando el script inline del reproductor.
 */
async function extractMP4Upload(embedUrl) {
  const origin = (() => { try { return new URL(embedUrl).origin } catch (_) { return "https://www.mp4upload.com" } })()
  const resp = await fetch(embedUrl, {
    headers: {
      "Referer": origin,
      "Origin": origin,
      "User-Agent": UA
    }
  })
  if (!resp.ok) throw Error(`HTTP error! Status: ${resp.status}`)
  const data = await resp.text()
  const match = /<script(?:.|\n)+?src:(?:.|\n)*?"(.+?\.mp4)"/g.exec(data)
  if (!match || !match[1]) throw Error("No se encontró URL .mp4 en el embed de MP4Upload")
  console.log(`[MP4Upload] URL extraída: ${match[1]}`)
  return {
    url: match[1],
    headers: { Referer: "https://www.mp4upload.com", Origin: "https://www.mp4upload.com", "User-Agent": UA }
  }
}

/**
 * UPNShare (https://animeav1.uns.bio/#<hash>)
 * El hash tras el # es el `id` que la API de UPNShare usa para servir el
 * video directo en /api/v1/video. No requiere parsear HTML: solo hace falta
 * reescribir la URL y mandar el Referer correcto (dominio raíz de uns.bio).
 */
async function extractUPNShare(embedUrl) {
  const url = new URL(embedUrl)
  const hash = url.hash?.replace(/^#/, '')
  if (!hash) throw Error("No se pudo extraer el ID (hash) del embed de UPNShare")

  const origin = url.origin // ej: https://animeav1.uns.bio
  const directUrl = `${origin}/api/v1/video?id=${encodeURIComponent(hash)}&w=1920&h=1080&r=`

  console.log(`[UPNShare] URL construida: ${directUrl}`)
  return {
    url: directUrl,
    headers: { Referer: `${origin}/`, "User-Agent": UA }
  }
}

// Registro de sources soportados: nombre (tal como aparece en AnimeAV1) -> { label, extract }
// Para sumar un nuevo source: escribir su función extract(url) -> {url, headers}, y agregarlo aquí.
Object.assign(SOURCE_EXTRACTORS, {
  MP4Upload: { label: "MP4Upload", extract: extractMP4Upload },
  UPNShare: { label: "UPNShare", extract: extractUPNShare }
})

// ─────────────────────────────────────────────
// Entry point — contrato Nuvio
// ─────────────────────────────────────────────

const getLangLabel = (dub) => dub ? "🇲🇽 LATINO" : "🇯🇵 JAPONÉS · 🇲🇽 Sub"

/**
 * @param {string|number} tmdbId
 * @param {string} type - "movie" | "tv"
 * @param {string|number} [season]
 * @param {string|number} [episode]
 * @returns {Promise<Array>}
 */
exports.getStreams = async function (tmdbId, type, season, episode) {
  if (!tmdbId || !type) return []
  console.log(`[AnimeAV1] Buscando: TMDB ${tmdbId} (${type}) S${season ?? '-'}E${episode ?? '-'}`)

  try {
    const info = await getTMDBInfo(tmdbId, type)
    if (!info) return []

    const candidates = await searchAnimeAV1(info.title, info.year)
    const match = pickBestMatch(candidates, info.title)
    console.log(`[AnimeAV1] Match elegido: "${match.title}" (${match.slug})`)

    const epNumber = type === "movie" ? 1 : (episode !== undefined ? Number(episode) : 1)
    let servers = await getEpisodeServers(match.slug, epNumber)

    // Fallback película: algunas están indexadas como episodio 0
    if (servers.length === 0 && type === "movie" && epNumber === 1) {
      console.warn(`[AnimeAV1] Reintentando película con episodio 0`)
      servers = await getEpisodeServers(match.slug, 0)
    }

    if (servers.length === 0) {
      console.warn(`[AnimeAV1] Sin servidores soportados para "${match.title}"`)
      return []
    }

    const results = await Promise.all(servers.map(async (server) => {
      const sourceKey = Object.keys(SOURCE_EXTRACTORS).find((key) => server.name.includes(key))
      const source = sourceKey ? SOURCE_EXTRACTORS[sourceKey] : null
      if (!source) return null

      try {
        const resolved = await source.extract(server.url)
        return {
          name: `AnimeAV1`,
          title: `📺 ${source.label} | 1080p | WEB-DL |\n${getLangLabel(server.dub)}`,
          url: resolved.url,
          quality: "1080p",
          headers: resolved.headers
        }
      } catch (e) {
        console.warn(`[${source.label}] Falló resolviendo un servidor: ${e.message}`)
        return null
      }
    }))

    const final = results.filter(Boolean)
    console.log(`[AnimeAV1] ✓ ${final.length} streams devueltos`)
    return final
  } catch (e) {
    console.error(`[AnimeAV1] Error: ${e.message}`)
    return []
  }
}
