// providers/animeav1.js
// Provider Nuvio para AnimeAV1 (https://animeav1.com)
// Sources activos: HLS de Zilla y HLS de Voe.
//
// Contrato Nuvio: exports.getStreams(tmdbId, type, season, episode) -> Promise<Array<Stream>>
// Stream: { name, title, url, quality, headers? }


const ANIMEAV1_BASE = "https://animeav1.com"
const TMDB_API_KEY = "56db0ec297530920213e1503706b81ff"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// Switch de sources: true/false para activar o desactivar cada uno sin tocar
// el resto del código. Se aplica al registrar SOURCE_EXTRACTORS más abajo —
// un source en false ni siquiera se prueba/extrae para ese episodio.
const ENABLED_SOURCES = {
  HLS: true,
  Voe: true,
}

// Servidores soportados: nombre tal como aparece en el HTML/__data.json de
// AnimeAV1 -> función extractora que resuelve el link directo reproducible.
// Para sumar un nuevo source: 1) agregar su extractor más abajo, 2) agregarlo
// al registro (con su entrada en ENABLED_SOURCES si quieres poder apagarlo).
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
  const originalTitle = data.original_title || data.original_name || title

  // origin_country: en /tv/{id} viene directo como array de códigos ISO
  // (ej. ["JP"]); en /movie/{id} no existe ese campo, el equivalente es
  // production_countries (array de {iso_3166_1, name}).
  const originCountries = type === "movie"
    ? (data.production_countries || []).map((c) => c.iso_3166_1)
    : (data.origin_country || [])

  // genres ya viene incluido en esta misma respuesta (sin request extra).
  // Genre ID 16 = "Animation" en TMDB — no existe un género "Anime" separado,
  // así que se usa como señal complementaria al país de origen (patrón
  // recomendado por la propia comunidad de TMDB: Animation + Japón ≈ anime).
  const genreIds = (data.genres || []).map((g) => g.id)
  const isAnimation = genreIds.includes(16)

  return { title, originalTitle, year, originCountries, isAnimation }
}

// Países de origen asociados a anime/animación asiática en TMDB. Se usa para
// descartar temprano contenido que claramente no es anime (ahorra requests
// inútiles a AnimeAV1 cuando alguien busca, por ejemplo, una serie occidental).
const ASIAN_COUNTRIES = ['JP', 'CN', 'KR', 'TW', 'HK']

function looksLikeAsianOrigin(originCountries) {
  // Si TMDB no dio el dato, no bloqueamos — es mejor intentar la búsqueda
  // igual que descartar por falta de información.
  if (!Array.isArray(originCountries) || originCountries.length === 0) return true
  return originCountries.some((c) => ASIAN_COUNTRIES.includes(c))
}

/**
 * Filtro combinado: país asiático Y género Animation. Refuerza el filtro de
 * origen — descarta, por ejemplo, dramas o series live-action japonesas que
 * no son anime, además de contenido occidental. Si TMDB no trajo `genres`
 * (no debería pasar en /movie/{id} o /tv/{id}, pero por seguridad), no
 * bloqueamos solo por eso.
 */
function looksLikeAnime(info) {
  if (!looksLikeAsianOrigin(info.originCountries)) return false
  if (info.isAnimation === false) return false
  return true
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
 * Fallback de año/título vía AniList (GraphQL), usado cuando TMDB no tiene el
 * año de la temporada o cuando el matching inicial no alcanza el umbral.
 * AniList evita depender de adivinar el formato exacto del sufijo de temporada.
 * El catálogo puede usar "2nd Season", "Season 2", etc., según el anime.
 * AniList devuelve `seasonYear` y el título romaji estructurados.
 *
 * Además de resolver el año, devuelve el título ROMAJI real de la temporada.
 * Se usa como segunda oportunidad cuando el resultado de AnimeAV1 es ambiguo.
 *
 * Estrategia:
 *  1. Buscar por el título base de TMDB.
 *  2. Tomar el primer resultado como ancla y extraer su título romaji base.
 *  3. Ordenar los candidatos de la misma serie por fecha y seleccionar la
 *     temporada solicitada.
 *
 * @returns {Promise<{year: number, romajiTitle: string}|undefined>}
 */
const ANILIST_SEASON_SUFFIX_RE = /\s+(?:\d+(?:st|nd|rd|th)\s+season|season\s+\d+(?:\s+part\s+\d+)?|part\s+\d+)\s*$/i

function anilistBaseTitle(romaji) {
  return romaji.replace(ANILIST_SEASON_SUFFIX_RE, '').trim()
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null
  let timer
  const request = fetch(url, { ...options, ...(controller ? { signal: controller.signal } : {}) })
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (controller) controller.abort()
      const error = new Error(`Timeout después de ${timeoutMs}ms`)
      error.name = 'AbortError'
      reject(error)
    }, timeoutMs)
  })
  try {
    return await Promise.race([request, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function getAniListInfo(title, seasonNum) {
  try {
    const query = `query ($search: String) {
      Page(page: 1, perPage: 15) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          title { romaji english }
          season
          seasonYear
          startDate { year month day }
        }
      }
    }`
    const resp = await fetchWithTimeout("https://graphql.anilist.co", {
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

    // No tratamos "Part 2" como Season 2: en varias series es la segunda
    // parte de la misma temporada (por ejemplo Mushoku Tensei S1 Part 2).
    const explicitSeason = sameSeries
      .map((m) => ({
        title: m.title?.romaji,
        year: m.seasonYear ?? m.startDate?.year,
        season: m.season,
        explicit: getNamedSeasonNumber(m.title?.romaji || ''),
        part: /\bpart\s*\d+\b/i.test(m.title?.romaji || '')
      }))
      .filter((m) => m.title && m.year)

    let target = explicitSeason.find((m) => m.explicit === seasonNum)
    if (!target && seasonNum === 1) {
      // Para S1 preferimos la entrada base; "Part 2" no cambia de temporada.
      target = explicitSeason.find((m) => m.explicit === undefined && !m.part)
    }
    if (!target && seasonNum === 1) {
      target = withDate.find((m) => !/\bpart\s*\d+\b/i.test(m.title || ''))
    }
    if (!target && seasonNum === 1) target = withDate[0]
    // Para S2+ NO usamos el índice cronológico como sustituto silencioso:
    // podría convertir "Part 2" de S1 en una falsa Season 2.
    if (!target && seasonNum > 1) {
      console.warn(`[AniList] No se identificó una Season ${seasonNum} explícita; no se usará Part 2 como sustituto`)
      return undefined
    }

    if (!target) {
      console.warn(`[AniList] No hay entrada para temporada ${seasonNum} (solo ${withDate.length} encontradas)`)
      return undefined
    }
    console.log(`[AniList] Temporada ${seasonNum} -> "${target.title}" year=${target.year}`)
    return { year: target.year, romajiTitle: target.title }
  } catch (e) {
    console.warn(`[AniList] getAniListInfo falló: ${e.message}`)
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

// Patrones que indican temporada 2+ en el título del catálogo.
const HIGHER_SEASON_PATTERNS = [
  /\b2nd\s+season\b/i, /\b3rd\s+season\b/i, /\b4th\s+season\b/i,
  /\bseason\s+[2-9]\b/i, /\bpart\s+[2-9]\b/i,
  /\b[2-9]\s*(?:st|nd|rd|th)?\s+temporada\b/i,
]

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'to', 'in', 'on', 'for', 'no', 'na',
  'la', 'el', 'los', 'las', 'de', 'del', 'y', 'en', 'con', 'part',
  'season', 'temporada', 'cour', 'arc'
])

function normalizeTitle(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`´]/g, '')
    .replace(/[-–—_:.,!?()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleTokens(s) {
  return normalizeTitle(s)
    .split(' ')
    .filter((token) => token && !STOP_WORDS.has(token))
}

function getExplicitSeason(title) {
  const value = normalizeTitle(title)
  let m = value.match(/\bseason\s*(\d+)\b/)
  if (m) return Number(m[1])
  m = value.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b/)
  if (m) return Number(m[1])
  m = value.match(/\b(?:s|t)\s*(\d+)\b/)
  if (m) return Number(m[1])
  m = value.match(/\bpart\s*(\d+)\b/)
  if (m) return Number(m[1])
  m = value.match(/\b(\d+)(?:st|nd|rd|th)?\s+temporada\b/)
  if (m) return Number(m[1])
  return undefined
}

// Igual que getExplicitSeason, pero deliberadamente ignora "Part N" porque
// una parte 2 puede seguir perteneciendo a la misma temporada (ej. Mushoku
// Tensei S1 Part 2). Solo estas formas se consideran una temporada real.
function getNamedSeasonNumber(title) {
  const value = normalizeTitle(title)
  let m = value.match(/\bseason\s*(\d+)\b/)
  if (m) return Number(m[1])
  m = value.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b/)
  if (m) return Number(m[1])
  m = value.match(/\b(?:s|t)\s*(\d+)\b/)
  if (m) return Number(m[1])
  m = value.match(/\b(\d+)(?:st|nd|rd|th)?\s+temporada\b/)
  if (m) return Number(m[1])
  return undefined
}

function wordSimilarity(target, candidate) {
  const targetTokens = [...new Set(titleTokens(target))]
  const candidateTokens = new Set(titleTokens(candidate))
  if (!targetTokens.length) return 0
  let matched = 0
  for (const token of targetTokens) {
    if (candidateTokens.has(token)) matched++
  }
  return matched / targetTokens.length
}

/**
 * Puntúa un candidato usando coincidencia por palabras + temporada.
 * El año se utiliza en la consulta a AnimeAV1 (minYear/maxYear), por lo que
 * no se inventa una puntuación de año que el resultado del catálogo no expone.
 *
 * Devuelve { candidate, score, similarity, candidateSeason }.
 */
function scoreCandidate(candidate, searchTerm, seasonNum) {
  const candidateTitle = candidate?.title || ''
  const target = normalizeTitle(searchTerm)
  const normalizedCandidate = normalizeTitle(candidateTitle)
  const similarity = wordSimilarity(searchTerm, candidateTitle)
  const explicitSeason = getExplicitSeason(candidateTitle)

  let score = similarity * 60

  // Coincidencia exacta: máxima confianza de título.
  if (normalizedCandidate === target) score += 30

  if (seasonNum > 1) {
    if (explicitSeason === seasonNum) score += 45
    else if (explicitSeason !== undefined) score -= 45
    // Si el título de búsqueda contiene el número de temporada, una coincidencia
    // del token numérico también aporta señal aunque el nombre del sitio no use
    // "Season N" literalmente.
    const targetHasSeasonNumber = new RegExp(`\\b${seasonNum}\\b`).test(target)
    if (targetHasSeasonNumber && new RegExp(`\\b${seasonNum}\\b`).test(normalizedCandidate)) score += 15
  } else if (explicitSeason !== undefined && explicitSeason > 1) {
    score -= 55
  }

  return { candidate, score, similarity, candidateSeason: explicitSeason }
}

/**
 * Elige el mejor candidato sin caer en `pool[0]`.
 * Se exige un umbral mínimo y se devuelve información de confianza para que
 * getStreams pueda probar AniList cuando la búsqueda sea ambigua.
 */
function pickBestMatch(candidates, searchTerm, seasonNum) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null

  let pool = candidates
  if (seasonNum === 1) {
    const filtered = candidates.filter((c) => !HIGHER_SEASON_PATTERNS.some((p) => p.test(c.title || '')))
    if (filtered.length > 0) pool = filtered
  }

  const scored = pool
    .map((candidate) => scoreCandidate(candidate, searchTerm, seasonNum))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  const second = scored[1]
  const gap = second ? best.score - second.score : best.score

  // Para una coincidencia de temporada >1 exigimos una señal de temporada
  // explícita o una coincidencia muy fuerte del título. Para T1 penalizamos
  // fuertemente títulos que anuncian otra temporada.
  const hasExpectedSeason = seasonNum === 1
    ? best.candidateSeason === undefined || best.candidateSeason === 1
    : best.candidateSeason === seasonNum
  const threshold = seasonNum > 1 ? 65 : 50
  const accepted = best.score >= threshold && (hasExpectedSeason || best.score >= 95)

  console.log(`[AnimeAV1] Matching: ${scored.slice(0, 5).map((x) => `"${x.candidate.title}"=${x.score.toFixed(1)}`).join(' | ')}`)
  console.log(`[AnimeAV1] Mejor match: "${best.candidate.title}" score=${best.score.toFixed(1)} gap=${gap.toFixed(1)} accepted=${accepted}`)

  return {
    ...best,
    gap,
    accepted,
    candidates: scored
  }
}

// ─────────────────────────────────────────────
// Extracción de servidores del episodio (__data.json + fallback HTML)
// ─────────────────────────────────────────────

/**
 * Obtiene la lista de servidores (embeds SUB/DUB) de un episodio dado.
 * Solo interesan los servidores HLS de Zilla y Voe.
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
    //   b) ya como valores literales: {server: "HLS" o "Voe", url: "https://..."}
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
 * Voe (https://voe.sx/e/<code>, redirige a un dominio espejo variable, ej.
 * jamesbornmain.com). El HTML del embed trae un <script type="application/json">
 * con un array de un solo string ofuscado. Pipeline de decodificación
 * confirmado leyendo el propio loader del sitio (loader.a40897e.js):
 *   ROT13 -> reemplazar 7 marcadores literales por "_" -> quitar "_"
 *   -> atob -> restar 3 al code de cada char -> invertir string -> atob
 *   -> JSON.parse
 * El JSON resultante trae `source`, que es el manifest HLS reproducible.
 * `fallback`/MP4 y `direct_access_url` se ignoran deliberadamente: 1.1.0
 * expone únicamente streams HLS, igual que el source HLS de Zilla.
 */
const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&']

function voeRot13(str) {
  return str.replace(/[a-zA-Z]/g, (char) => {
    const code = char.charCodeAt(0)
    const base = code <= 90 ? 65 : 97
    return String.fromCharCode((code - base + 13) % 26 + base)
  })
}

function voeReplaceMarkers(str) {
  let out = str
  for (const marker of VOE_MARKERS) {
    out = out.split(marker).join('_')
  }
  return out
}

function decodeVoePayload(rawValue) {
  let x = voeRot13(rawValue)
  x = voeReplaceMarkers(x)
  x = x.split('_').join('')
  x = atob(x)
  x = Array.from(x).map((c) => String.fromCharCode((c.charCodeAt(0) - 3 + 256) % 256)).join('')
  x = x.split('').reverse().join('')
  x = atob(x)
  return JSON.parse(x)
}

// extractVoe devuelve únicamente el manifest HLS reproducible de Voe.
async function extractVoe(embedUrl) {
  // El fetch sigue la redirección HTTP normal, pero VOE también puede
  // devolver una página intermedia que redirige mediante JavaScript.
  let resp = await fetch(embedUrl, {
    headers: { "User-Agent": UA }
  })
  if (!resp.ok) throw Error(`HTTP error! Status: ${resp.status}`)

  let html = await resp.text()

  // fetch() no ejecuta JavaScript, así que seguimos manualmente la redirección
  // window.location.href que usa VOE.
  const jsRedirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/)
  if (jsRedirect) {
    const redirectUrl = jsRedirect[1]
    console.log(`[Voe] Redirección JS detectada: ${redirectUrl}`)

    resp = await fetch(redirectUrl, {
      headers: { "User-Agent": UA }
    })
    if (!resp.ok) throw Error(`HTTP error! Status: ${resp.status}`)

    html = await resp.text()
  }

  const scriptMatch = html.match(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/)
  if (!scriptMatch) throw Error("No se encontró el <script type=\"application/json\"> en el embed de Voe")

  // El HTML puede traer el contenido con entidades HTML sin decodificar
  // (&amp; en vez de &, &#34; en vez de "), lo cual además coincide
  // parcialmente con uno de los marcadores de ofuscación (#&) — hay que
  // decodificar las entidades HTML antes de parsear el array JSON.
  const jsonText = scriptMatch[1]
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

  let payloadArray
  try {
    payloadArray = JSON.parse(jsonText)
  } catch (e) {
    throw Error(`No se pudo parsear el array JSON del embed de Voe: ${e.message}`)
  }
  if (!Array.isArray(payloadArray) || !payloadArray[0]) {
    throw Error("El embed de Voe no trajo el payload esperado")
  }

  let decoded
  try {
    decoded = decodeVoePayload(payloadArray[0])
  } catch (e) {
    throw Error(`No se pudo decodificar el payload de Voe: ${e.message}`)
  }

  const voeOrigin = (() => { try { return new URL(embedUrl).origin } catch (_) { return undefined } })()
  // Mismos headers Sec-Fetch-* que confirmamos necesarios para zilla-networks
  // (Cloudflare/CDNs similares suelen exigirlos en los segmentos del manifest).
  const hlsHeaders = {
    "Referer": voeOrigin ? `${voeOrigin}/` : embedUrl,
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    "User-Agent": UA
  }
  if (!decoded.source) throw Error("El payload de Voe no trajo source HLS")

  console.log(`[Voe] HLS extraído: ${decoded.source}`)
  return {
    url: decoded.source,
    headers: hlsHeaders,
    type: "hls"
  }
}

// Registro de sources activos: únicamente HLS directo de Zilla y HLS de Voe.
const ALL_SOURCES = {
  HLS: { label: "HLS", extract: extractZillaHLS },
  Voe: { label: "Voe HLS", extract: extractVoe }
}

for (const [key, source] of Object.entries(ALL_SOURCES)) {
  if (ENABLED_SOURCES[key]) SOURCE_EXTRACTORS[key] = source
}

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
    // seasonNum no depende de ningún fetch — se calcula primero para poder
    // disparar getTMDBInfo y getSeasonYear en paralelo (antes se esperaba
    // getTMDBInfo completo antes de siquiera empezar getSeasonYear, aunque
    // ninguno depende del resultado del otro).
    const seasonNum = type === "movie" ? 1 : (season ? Number(season) : 1)

    const [info, tmdbSeasonYear] = await Promise.all([
      getTMDBInfo(tmdbId, type),
      // Para películas no existe temporada en TMDB — evitamos la llamada de más.
      type === "movie" ? Promise.resolve(undefined) : getSeasonYear(tmdbId, seasonNum)
    ])
    if (!info) return []

    if (!looksLikeAnime(info)) {
      const reason = !looksLikeAsianOrigin(info.originCountries)
        ? `origen no asiático (${info.originCountries.join(', ') || 'desconocido'})`
        : `sin género Animation`
      console.log(`[AnimeAV1] Descartado (${reason}), omitiendo búsqueda: "${info.title}"`)
      return []
    }

    // Matching 1.1.0: título por palabras + temporada + año de búsqueda.
    // TMDB aporta el año de la temporada; si el resultado es ambiguo, AniList
    // aporta el título romaji y vuelve a ejecutarse el matching.
    let seasonYear = type === "movie" ? info.year : tmdbSeasonYear
    let searchTerm = seasonNum !== 1 ? `${info.title} ${seasonNum}` : info.title

    if (seasonYear === undefined && type !== "movie") {
      console.warn(`[AnimeAV1] TMDB sin año para temporada ${seasonNum}, probando AniList`)
      const aniListInfo = await getAniListInfo(info.title, seasonNum)
      if (aniListInfo) {
        seasonYear = aniListInfo.year
        searchTerm = aniListInfo.romajiTitle
      }
    }

    console.log(`[AnimeAV1] searchTerm="${searchTerm}" year=${seasonYear ?? 'ninguno'}`)
    let candidates = await searchAnimeAV1(searchTerm, seasonYear)
    let matchInfo = pickBestMatch(candidates, searchTerm, seasonNum)

    // Si el primer intento no alcanza el umbral, AniList es solo una mejora
    // opcional. Tiene timeout corto y cualquier error/caída deja intacto el
    // matching local de TMDB; nunca es una dependencia del provider.
    if (!matchInfo?.accepted && type !== "movie") {
      console.warn(`[AnimeAV1] Matching ambiguo para "${searchTerm}"; probando AniList (opcional)`)
      try {
        const aniListInfo = await getAniListInfo(info.title, seasonNum)
        if (aniListInfo) {
          const retryYear = aniListInfo.year ?? seasonYear
          const retryTerm = aniListInfo.romajiTitle
          if (retryTerm && (retryTerm !== searchTerm || retryYear !== seasonYear)) {
            try {
              candidates = await searchAnimeAV1(retryTerm, retryYear)
              const retryMatch = pickBestMatch(candidates, retryTerm, seasonNum)
              if (retryMatch?.accepted || !matchInfo?.accepted) {
                matchInfo = retryMatch
                seasonYear = retryYear
                searchTerm = retryTerm
              }
            } catch (e) {
              console.warn(`[AnimeAV1] Segunda búsqueda AniList falló: ${e.message}`)
            }
          }
        } else {
          console.warn(`[AnimeAV1] AniList no disponible/sin resultado; continuando con matching local`)
        }
      } catch (e) {
        console.warn(`[AnimeAV1] AniList omitido (${e.name === 'AbortError' ? 'timeout' : e.message}); continuando con matching local`)
      }

      // Fallback local: si TMDB tiene título original distinto al título
      // localizado, probamos ese nombre sin depender de AniList.
      if (!matchInfo?.accepted && info.originalTitle && normalizeTitle(info.originalTitle) !== normalizeTitle(searchTerm)) {
        try {
          console.log(`[AnimeAV1] Probando título original de TMDB: "${info.originalTitle}"`)
          const localCandidates = await searchAnimeAV1(info.originalTitle, seasonYear)
          const localMatch = pickBestMatch(localCandidates, info.originalTitle, seasonNum)
          if (localMatch?.accepted || localMatch?.score > (matchInfo?.score ?? -Infinity)) {
            matchInfo = localMatch
            searchTerm = info.originalTitle
          }
        } catch (e) {
          console.warn(`[AnimeAV1] Fallback con título original falló: ${e.message}`)
        }
      }
    }

    if (!matchInfo?.accepted) {
      console.warn(`[AnimeAV1] No hay una coincidencia suficientemente segura para "${searchTerm}"; no se usará el primer resultado`)
      return []
    }

    const match = matchInfo.candidate
    console.log(`[AnimeAV1] Match elegido: "${match.title}" (${match.slug}) score=${matchInfo.score.toFixed(1)}`)

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

    // Orden de salida: primero HLS Zilla y luego Voe HLS; dentro de cada source,
    // SUB (japonés) antes que DUB (latino).
    const sourceOrder = Object.keys(SOURCE_EXTRACTORS)
    servers = [...servers].sort((a, b) => {
      const aIdx = sourceOrder.findIndex((key) => a.name.includes(key))
      const bIdx = sourceOrder.findIndex((key) => b.name.includes(key))
      if (aIdx !== bIdx) return aIdx - bIdx
      return (a.dub ? 1 : 0) - (b.dub ? 1 : 0) // false (SUB) antes que true (DUB)
    })

    const results = await Promise.all(servers.map(async (server) => {
      const sourceKey = Object.keys(SOURCE_EXTRACTORS).find((key) => server.name.includes(key))
      const source = sourceKey ? SOURCE_EXTRACTORS[sourceKey] : null
      if (!source) return null

      try {
        const resolved = await source.extract(server.url)
        // Los extractores devuelven un objeto HLS reproducible; se normaliza a array
        // para mantener el flujo común de procesamiento.
        const variantsList = Array.isArray(resolved) ? resolved : [resolved]

        return variantsList.map((variant) => {
          const sourceLabel = source.label
          const quality = sourceKey === "Voe" ? "720p" : "1080p"
          const label = `📺 ${sourceLabel}\n${quality} | WEB-DL | Anime\n${getLangLabel(server.dub)}`
          return {
            name: `AnimeAV1`,
            title: "",     // vacío por pedido: toda la info visible va en quality
            url: variant.url,
            quality: label, // label completo, ordenado, con \n reales entre líneas
            headers: variant.headers,
            ...(variant.type ? { type: variant.type } : {})
          }
        })
      } catch (e) {
        console.warn(`[${source.label}] Falló resolviendo un servidor: ${e.message}`)
        return null
      }
    }))

    const final = results.filter(Boolean).flat()
    const unique = [...new Map(final.map((stream) => [`${stream.url}|${stream.quality}`, stream])).values()]
    console.log(`[AnimeAV1] ✓ ${unique.length} streams devueltos`)
    return unique
  } catch (e) {
    console.error(`[AnimeAV1] Error: ${e.message}`)
    return []
  }
}
