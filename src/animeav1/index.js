// providers/animeav1.js
// Provider Nuvio para AnimeAV1 (https://animeav1.com)
// Único source: MP4Upload (sin HLS/zilla-networks — bloqueado por Cloudflare a nivel de segmentos)
//
// Contrato Nuvio: exports.getStreams(tmdbId, type, season, episode) -> Promise<Array<Stream>>
// Stream: { name, title, url, quality, headers? }

const CryptoJS = require("crypto-js")

const ANIMEAV1_BASE = "https://animeav1.com"
const TMDB_API_KEY = "56db0ec297530920213e1503706b81ff"
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

/**
 * Año de emisión de una temporada específica, vía TMDB /tv/{id}/season/{n}.
 * Es la pieza clave para distinguir temporadas: AnimeAV1 no organiza por
 * temporada dentro de un slug, así que buscamos por año + título para
 * encontrar la entrada correcta del catálogo (cada temporada suele ser una
 * entrada de catálogo separada).
 */
async function getSeasonYear(tmdbId, seasonNum) {
  try {
    const url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=en-US`
    const data = await fetch(url, { headers: { "User-Agent": UA } }).then((r) => {
      if (!r.ok) throw Error(`HTTP error! Status: ${r.status}`)
      return r.json()
    })
    const airDate = data?.air_date
    const year = airDate ? new Date(airDate).getFullYear() : undefined
    console.log(`[TMDB] Temporada ${seasonNum}: air_date="${airDate}" -> year=${year}`)
    return year
  } catch (e) {
    console.warn(`[TMDB] getSeasonYear falló (temporada ${seasonNum}): ${e.message}`)
    return undefined
  }
}

/**
 * Fallback de año vía AniList (GraphQL), usado solo cuando TMDB no tiene el
 * año de la temporada (común en animes con temporadas "artificiales" en TMDB).
 * Reemplaza a Jikan: Jikan requiere adivinar el formato exacto del sufijo de
 * temporada en el título de búsqueda ("2nd Season" vs "Season 2", etc.), lo
 * cual varía por anime y causaba fallos (ej. Re:Zero). AniList devuelve
 * `seasonYear` como campo numérico estructurado, sin depender de parsear texto.
 *
 * Estrategia:
 *  1. Buscar por el título base (en inglés, el que da TMDB).
 *  2. Tomar el primer resultado como ancla y extraer su título romaji base
 *     (sin sufijos de temporada) para filtrar solo entradas de la misma serie
 *     — AniList devuelve también spin-offs/specials con nombres relacionados
 *     pero distintos (ej. "Kyuukei Jikan (Break Time)" para Re:Zero).
 *  3. Ordenar los candidatos filtrados cronológicamente por fecha de estreno
 *     y devolver el año de la posición [seasonNum - 1] — asume que las
 *     temporadas están numeradas en orden de emisión, igual que TMDB.
 */
const ANILIST_SEASON_SUFFIX_RE = /\s+(?:\d+(?:st|nd|rd|th)\s+season|season\s+\d+(?:\s+part\s+\d+)?|part\s+\d+)\s*$/i

function anilistBaseTitle(romaji) {
  return romaji.replace(ANILIST_SEASON_SUFFIX_RE, '').trim()
}

async function getAniListYear(title, seasonNum) {
  try {
    const query = `query ($search: String) {
      Page(page: 1, perPage: 15) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          title { romaji english }
          seasonYear
          startDate { year month day }
        }
      }
    }`
    const resp = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ query, variables: { search: title } })
    })
    if (!resp.ok) throw Error(`HTTP error! Status: ${resp.status}`)
    const json = await resp.json()
    const results = json?.data?.Page?.media
    if (!Array.isArray(results) || results.length === 0) {
      console.warn(`[AniList] Sin resultados para "${title}"`)
      return undefined
    }

    const anchor = results[0]
    const baseRomaji = anilistBaseTitle(anchor.title?.romaji || '')
    if (!baseRomaji) return undefined

    const sameSeries = results.filter((m) => anilistBaseTitle(m.title?.romaji || '').toLowerCase() === baseRomaji.toLowerCase())

    const withDate = sameSeries
      .map((m) => {
        const sd = m.startDate
        const year = m.seasonYear ?? sd?.year
        if (!year) return null
        const sortKey = sd?.year ? `${sd.year}-${String(sd.month || 1).padStart(2, '0')}-${String(sd.day || 1).padStart(2, '0')}` : `${year}-01-01`
        return { title: m.title?.romaji, year, sortKey }
      })
      .filter(Boolean)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))

    console.log(`[AniList] "${baseRomaji}" — ${withDate.length} temporada(s) encontradas: ${withDate.map(w => `${w.title}(${w.year})`).join(', ')}`)

    const target = withDate[seasonNum - 1]
    if (!target) {
      console.warn(`[AniList] No hay entrada para temporada ${seasonNum} (solo ${withDate.length} encontradas)`)
      return undefined
    }
    console.log(`[AniList] Temporada ${seasonNum} -> "${target.title}" year=${target.year}`)
    return target.year
  } catch (e) {
    console.warn(`[AniList] getAniListYear falló: ${e.message}`)
    return undefined
  }
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
 * Descarga y parsea el catálogo/búsqueda de AnimeAV1 vía regex, sin cheerio.
 *
 * El HTML de /catalogo NO expone los resultados vía __data.json de forma
 * fiable con `search=` (confirmado: ese endpoint ignora el filtro y devuelve
 * el catálogo completo sin filtrar). Los resultados reales están embebidos
 * en un <script> dentro del HTML normal, como argumento de una función JS
 * auto-ejecutada (IIFE) que arma cada resultado como:
 *   { id: "...", title: "...", synopsis: "...", categoryId: N, slug: "..." }
 * No es JSON válido (es código JS ejecutable, con una IIFE armando el objeto
 * `category` compartido), así que se extrae campo por campo con regex, igual
 * que ya se hace en el fallback HTML de getEpisodeServers.
 */
async function searchAnimesBySpecificURL(url) {
  const html = await fetch(url, { headers: { "User-Agent": UA } }).then((resp) => {
    if (!resp.ok) throw Error(`HTTP error! Status: ${resp.status}`)
    return resp.text()
  })

  // Cada resultado sigue el patrón: { id: "X", title: "Y", synopsis: "Z", categoryId: N, slug: "W" ...
  // synopsis puede contener comillas escapadas (\") y saltos de línea (\n), contemplados en el regex.
  const objBlockRegex = /\{\s*id:\s*"([^"]+)",\s*title:\s*"((?:[^"\\]|\\.)*)",\s*synopsis:\s*"((?:[^"\\]|\\.)*)",\s*categoryId:\s*\d+,\s*slug:\s*"([^"]+)"/g

  const media = []
  let m
  while ((m = objBlockRegex.exec(html)) !== null) {
    media.push({
      id: m[1],
      title: m[2].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
      synopsis: m[3].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
      slug: m[4]
    })
  }

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

// Patrones que indican temporada 2+ en el título del catálogo — se usan para
// descartar candidatos de temporadas superiores cuando buscamos la T1.
const HIGHER_SEASON_PATTERNS = [
  /\b2nd\s+season\b/i, /\b3rd\s+season\b/i, /\b4th\s+season\b/i,
  /\bseason\s+[2-9]\b/i, /\bpart\s+[2-9]\b/i,
  /\b2\w*\s+temporada\b/i,
  /\s+[2-9]$/,
]

/**
 * Elige el mejor candidato de una lista de resultados de búsqueda.
 * @param {Array} candidates
 * @param {string} searchTerm - término de búsqueda ya con temporada incluida si aplica (ej: "Frieren 3")
 * @param {number} seasonNum
 */
function pickBestMatch(candidates, searchTerm, seasonNum) {
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

  let pool = candidates
  if (seasonNum === 1) {
    // Para temporada 1, evitamos que un resultado de T2/T3 gane el match
    // (por ejemplo si el catálogo no tiene la T1 pero sí la T2 con título similar).
    const filtered = candidates.filter((c) => !HIGHER_SEASON_PATTERNS.some((p) => p.test(c.title)))
    if (filtered.length > 0) pool = filtered
  }

  const target = norm(searchTerm)
  let best = pool.find((c) => norm(c.title) === target)
  if (best) return best
  best = pool.find((c) => norm(c.title).includes(target) || target.includes(norm(c.title)))
  if (best) return best
  return pool[0]
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

    function matchesSupportedSource(name) {
      return Object.keys(SOURCE_EXTRACTORS).some((key) => name.includes(key))
    }

    // El __data.json de SvelteKit serializa arrays anidados como índices hacia
    // dataArray (formato "devalue"), así que embeds.SUB es un índice, no el
    // array en sí. Pero los OBJETOS dentro de ese array pueden venir de dos formas:
    //   a) también indexados: {server: <idx>, url: <idx>} -> hay que resolver cada campo
    //   b) ya como valores literales: {server: "MP4Upload", url: "https://..."}
    // Soportamos ambos casos sin asumir cuál aplica.
    function resolveField(value) {
      // Si es un índice numérico válido dentro de dataArray, lo resolvemos;
      // si ya es un string usable (empieza con http o es un nombre de server
      // corto), lo devolvemos tal cual.
      if (typeof value === 'number' && dataArray[value] !== undefined) {
        const resolved = dataArray[value]
        if (typeof resolved === 'string') return resolved
      }
      if (typeof value === 'string') return value
      return null
    }

    function resolveServer(entry) {
      try {
        // `entry` puede ser un índice hacia un objeto {server, url}, o el objeto ya resuelto.
        const obj = typeof entry === 'number' ? dataArray[entry] : entry
        if (!obj || typeof obj !== 'object') return null
        const serverName = resolveField(obj.server)
        const url = resolveField(obj.url)
        if (typeof serverName !== 'string' || typeof url !== 'string') return null
        return { name: serverName, url }
      } catch (_) { return null }
    }

    function extractServers(listOrIndex, dub) {
      const list = typeof listOrIndex === 'number' ? dataArray[listOrIndex] : listOrIndex
      if (!Array.isArray(list)) return
      for (const entry of list) {
        const server = resolveServer(entry)
        if (!server || !server.url.startsWith('http')) continue
        if (!matchesSupportedSource(server.name)) continue // ── solo sources soportados ──
        servers.push({ name: server.name, url: server.url, dub })
        console.log(`[AnimeAV1] Servidor detectado: ${server.name} (${dub ? 'DUB' : 'SUB'})`)
      }
    }

    const subIndex = embeds.SUB ?? embeds.sub
    const dubIndex = embeds.DUB ?? embeds.dub
    if (subIndex !== undefined) extractServers(subIndex, false)
    if (dubIndex !== undefined) extractServers(dubIndex, true)

    // Algunos episodios exponen sources como "download" en vez de "embed"
    const downloadsIndex = episodeObj.downloads
    if (downloadsIndex !== undefined) {
      const downloads = dataArray[downloadsIndex]
      if (downloads && typeof downloads === 'object') {
        const dlSubIndex = downloads.SUB ?? downloads.sub
        const dlDubIndex = downloads.DUB ?? downloads.dub
        if (dlSubIndex !== undefined) extractServers(dlSubIndex, false)
        if (dlDubIndex !== undefined) extractServers(dlDubIndex, true)
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
    // Antes se usaba cheerio para localizar el <script> con kit.start(...);
    // como solo hace falta encontrar ESE bloque de texto dentro del HTML
    // completo (no navegar el DOM), una regex simple lo aísla igual de bien.
    const metadataJSON = html.match(/kit\.start\(app,\s*element,\s*\{[\s\S]*/)?.[0]

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

/**
 * HLS/zilla-networks.
 * Confirmado funcionando en producción (móvil y TV) gracias a los headers
 * Sec-Fetch-Site/Mode/Dest, que Cloudflare exige en cada segmento del manifest
 * para no responder 403 (con solo Referer + User-Agent los segmentos fallaban).
 */
async function extractZillaHLS(playUrl) {
  const directUrl = playUrl.replace('/play/', '/m3u8/')
  console.log(`[HLS-zilla] URL construida: ${directUrl}`)
  return {
    url: directUrl,
    headers: {
      "Referer": "https://player.zilla-networks.com/",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Dest": "empty",
      "User-Agent": UA
    },
    type: "hls"
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
 *
 * Portado de RpmvidExtractor.kt (proyecto Streamflix). El endpoint
 * /api/v1/video no devuelve el video ni un manifest en claro: devuelve un
 * payload hexadecimal que es JSON cifrado con AES-128/CBC/PKCS7 (clave e IV
 * fijos, hardcodeados por el propio sitio — no son secretos nuestros).
 * Una vez descifrado, el JSON trae una de varias rutas posibles:
 *   - hls / hlsVideoTiktok -> manifest HLS relativo al dominio de uns.bio
 *   - cf                   -> link "cf" (con posible firma k/kx o cfExpire)
 *   - source                -> link directo
 *
 * IMPORTANTE: en la mayoría de los casos observados, la ruta resuelta es HLS.
 * Eso significa que hereda el mismo riesgo que zilla-networks: si Cloudflare
 * aplica una regla WAF agresiva a los segmentos de uns.bio, esto podría
 * fallar en producción igual que zilla, incluso si el manifest se resuelve bien.
 * No confirmado aún — a validar con pruebas reales.
 */
const UPN_AES_KEY = "kiemtienmua911ca" // 16 bytes -> AES-128
const UPN_AES_IV = "1234567890oiuytr"  // 16 bytes

function decryptUPNSharePayload(hexPayload) {
  const key = CryptoJS.enc.Utf8.parse(UPN_AES_KEY)
  const iv = CryptoJS.enc.Utf8.parse(UPN_AES_IV)
  const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Hex.parse(hexPayload) })
  const decrypted = CryptoJS.AES.decrypt(cipherParams, key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 })
  return decrypted.toString(CryptoJS.enc.Utf8)
}

async function extractUPNShare(embedUrl) {
  const hashMatch = embedUrl.match(/#([^/?#]+)/)
  const hash = hashMatch?.[1]
  if (!hash) throw Error("No se pudo extraer el ID (hash) del embed de UPNShare")

  const originMatch = embedUrl.match(/^(https?:\/\/[^/#?]+)/)
  const origin = originMatch?.[1]
  if (!origin) throw Error("No se pudo extraer el origin del embed de UPNShare")

  const apiUrl = `${origin}/api/v1/video?id=${encodeURIComponent(hash)}&w=1920&h=1080&r=`
  const resp = await fetch(apiUrl, { headers: { Referer: `${origin}/`, "User-Agent": UA } })
  if (!resp.ok) throw Error(`HTTP error! Status: ${resp.status}`)
  const hexPayload = await resp.text()

  let json
  try {
    json = JSON.parse(decryptUPNSharePayload(hexPayload))
  } catch (e) {
    throw Error(`No se pudo descifrar/parsear el payload de UPNShare: ${e.message}`)
  }

  const hlsPath = json.hls || undefined
  const hlsTiktok = json.hlsVideoTiktok || undefined
  const sourcePath = json.source || undefined
  let cfPath = json.cf || undefined
  const cfExpire = json.cfExpire || undefined

  let finalUrl, isHLS = false

  if (hlsPath) {
    finalUrl = `${origin}${hlsPath}`
    isHLS = true
  } else if (hlsTiktok) {
    let v = "", domain = ""
    try {
      const config = JSON.parse(json.streamingConfig || "{}")
      const tiktok = config?.adjust?.Tiktok
      v = tiktok?.params?.v || ""
      domain = tiktok?.domain || ""
    } catch (_) { /* no-op */ }
    const tiktokPath = (domain && hlsTiktok.startsWith('/hls/'))
      ? hlsTiktok.replace('/hls/', `/hlsmod/${domain}/`)
      : hlsTiktok
    finalUrl = `${origin}${tiktokPath}${v ? `?v=${v}` : ''}`
    isHLS = true
  } else if (cfPath && !cfPath.includes('skyforgeconcepts.shop')) {
    const pk = json.pk
    if (pk?.k && pk?.kx) {
      cfPath = `${cfPath}?k=${pk.k}&kx=${pk.kx}`
    } else if (cfExpire) {
      const [t, e] = String(cfExpire).split('::')
      if (t && e) cfPath = `${cfPath}?t=${t}&e=${e}`
    }
    finalUrl = cfPath
  } else if (sourcePath) {
    finalUrl = sourcePath
  } else {
    throw Error("Payload de UPNShare sin hls, hlsVideoTiktok, cf ni source")
  }

  console.log(`[UPNShare] Resuelto (${isHLS ? 'HLS' : 'directo'}): ${finalUrl}`)
  return {
    url: finalUrl,
    headers: { Referer: `${origin}/`, ...(isHLS ? {} : { Origin: origin }) },
    type: isHLS ? "hls" : "mp4"
  }
}

// Registro de sources soportados: nombre (tal como aparece en AnimeAV1) -> { label, extract }
// Para sumar un nuevo source: escribir su función extract(url) -> {url, headers}, y agregarlo aquí.
Object.assign(SOURCE_EXTRACTORS, {
  MP4Upload: { label: "MP4Upload", extract: extractMP4Upload },
  UPNShare: { label: "UPNShare", extract: extractUPNShare },
  HLS: { label: "HLS", extract: extractZillaHLS }
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

    const seasonNum = type === "movie" ? 1 : (season ? Number(season) : 1)
    // Para temporadas 2+, el término de búsqueda incluye el número de
    // temporada (ej: "Frieren 3"), ya que en AnimeAV1 cada temporada es una
    // entrada de catálogo distinta, no un sub-item del slug base.
    const searchTerm = seasonNum !== 1 ? `${info.title} ${seasonNum}` : info.title

    // Año de la temporada específica: TMDB primero, AniList como respaldo
    // (solo si TMDB falla/no tiene el dato — TMDB es la fuente principal).
    // Es lo que nos permite distinguir "Frieren T1 (2023)" de "Frieren T3 (2026)"
    // cuando ambas entradas del catálogo tienen títulos casi idénticos.
    let seasonYear
    if (type === "movie") {
      seasonYear = info.year
    } else {
      seasonYear = await getSeasonYear(tmdbId, seasonNum)
      if (seasonYear === undefined) {
        console.warn(`[AnimeAV1] TMDB sin año para temporada ${seasonNum}, probando AniList`)
        seasonYear = await getAniListYear(info.title, seasonNum)
      }
    }

    console.log(`[AnimeAV1] searchTerm="${searchTerm}" year=${seasonYear ?? 'ninguno'}`)
    const candidates = await searchAnimeAV1(searchTerm, seasonYear)
    const match = pickBestMatch(candidates, searchTerm, seasonNum)
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
          quality: `${source.label} | 1080p | WEB-DL | ${getLangLabel(server.dub)}`,
          headers: resolved.headers,
          ...(resolved.type ? { type: resolved.type } : {})
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
