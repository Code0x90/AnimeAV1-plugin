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

  const originalTitle = data.original_title || data.original_name || title
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

async function getAniListInfo(title, seasonNum) {
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
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000
const animeAV1SearchCache = new Map()

function isStrongSearchMatch(candidates, searchTerm, seasonNum) {
  if (!Array.isArray(candidates) || !candidates.length) return false
  let pool = candidates
  if (seasonNum === 1) {
    const filtered = candidates.filter((c) => !HIGHER_SEASON_PATTERNS.some((p) => p.test(c.title || '')))
    if (filtered.length) pool = filtered
  }
  const scored = pool.map((candidate) => scoreCandidate(candidate, searchTerm, seasonNum)).sort((a, b) => b.score - a.score)
  if (!scored.length) return false
  const best = scored[0]
  const hasExpectedSeason = seasonNum === 1
    ? best.candidateSeason === undefined || best.candidateSeason === 1
    : best.candidateSeason === seasonNum
  const threshold = seasonNum > 1 ? 65 : 50
  return best.score >= threshold && (hasExpectedSeason || best.score >= 95)
}

/**
 * Busca un anime en AnimeAV1 usando variantes progresivas.
 * Se detiene en cuanto una variante produce un match suficientemente seguro.
 * Los candidatos se cachean brevemente; las URLs HLS/Voe no se cachean aquí.
 */
async function searchAnimeAV1(query, year, seasonNum = 1) {
  const runSearch = async (searchQuery) => {
    const cacheKey = `${String(searchQuery).trim()}|${year ?? ''}`
    const cached = animeAV1SearchCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp) < SEARCH_CACHE_TTL_MS) {
      console.log(`[AnimeAV1] Cache búsqueda: "${searchQuery}"`)
      return cached.media
    }
    if (cached) animeAV1SearchCache.delete(cacheKey)

    const searchURL = buildSearchURL(searchQuery, undefined, year)
    console.log(`[AnimeAV1] Buscando: ${searchURL}`)
    const data = await searchAnimesBySpecificURL(searchURL)
    if (!data?.media?.length) throw Error("No search results!")
    animeAV1SearchCache.set(cacheKey, { timestamp: Date.now(), media: data.media })
    return data.media
  }

  const tryVariant = async (variant) => {
    try {
      const media = await runSearch(variant)
      if (isStrongSearchMatch(media, variant, seasonNum)) {
        console.log(`[AnimeAV1] Match suficiente en esta búsqueda; se detienen variantes adicionales`)
      }
      return { media, strong: isStrongSearchMatch(media, variant, seasonNum) }
    } catch (e) {
      if (e.message !== "No search results!") throw e
      return null
    }
  }

  const first = await tryVariant(query)
  if (first?.strong) return first.media

  const sanitized = sanitizeQuery(query)
  if (sanitized && sanitized !== query) {
    const second = await tryVariant(sanitized)
    if (second) {
      if (second.strong) return second.media
      // Si ya tenemos candidatos pero ninguno es seguro, no hacemos la búsqueda
      // genérica de primeras palabras: aporta ruido y no sustituye AniList.
      return second.media
    }
  }

  const base = sanitized || query
  const firstWords = base.split(' ').filter(Boolean).slice(0, 3).join(' ')
  if (firstWords && firstWords !== base) {
    const third = await tryVariant(firstWords)
    if (third) return third.media
  }

  if (first) return first.media
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

// Algunos catálogos usan un título corto/alias seguido del título largo entre
// separadores, por ejemplo:
//   WATAMOTE ~No Matter How I Look at It...~
// Mientras AnimeAV1 puede devolver simplemente "Watamote!".
// No usamos includes() indiscriminadamente: solo consideramos como alias los
// segmentos iniciales claramente delimitados y luego exigimos igualdad exacta
// tras normalización. Esto evita aceptar falsos positivos como "Naruto" por
// el simple hecho de aparecer dentro de "Naruto Shippuden".
function getTitleAliases(target) {
  const raw = String(target || '').trim()
  if (!raw) return []

  const aliases = []
  const add = (value) => {
    const normalized = normalizeTitle(value)
    if (!normalized || normalized.length < 3) return
    if (!aliases.includes(normalized)) aliases.push(normalized)
  }

  // Alias/título corto al comienzo del título largo.
  const prefix = raw.match(/^\s*(.+?)\s*(?:~|:|\s[-–—]\s|\(|\[)/)
  if (prefix) add(prefix[1])

  // En títulos que usan comillas alrededor de un subtítulo, conserva también
  // el texto que queda antes de la primera comilla/apertura delimitadora.
  const quotedPrefix = raw.match(/^\s*(.+?)\s*(?:["“”]|«)/)
  if (quotedPrefix) add(quotedPrefix[1])

  return aliases
}

function getAliasExactMatch(target, candidate) {
  const normalizedCandidate = normalizeTitle(candidate)
  if (!normalizedCandidate) return undefined
  return getTitleAliases(target).find((alias) => alias === normalizedCandidate)
}

/**
 * Puntúa un candidato usando coincidencia por palabras + alias + temporada.
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
  const aliasExact = getAliasExactMatch(searchTerm, candidateTitle)
  const explicitSeason = getExplicitSeason(candidateTitle)

  let score = similarity * 60

  // Coincidencia exacta del título completo: máxima confianza de título.
  if (normalizedCandidate === target) score += 30

  // Coincidencia exacta con un alias/título corto explícitamente delimitado.
  // Es deliberadamente una señal muy fuerte, pero no se activa para simples
  // subcadenas. Así "Watamote!" puede representar el título largo de TMDB
  // "WATAMOTE ~No Matter How I Look at It...~" sin relajar el umbral global.
  if (aliasExact) score = Math.max(score, 100)

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

  return { candidate, score, similarity, candidateSeason: explicitSeason, aliasExact }
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

  console.log(`[AnimeAV1] Matching: ${scored.slice(0, 5).map((x) => `"${x.candidate.title}"=${x.score.toFixed(1)}${x.aliasExact ? ' [alias]' : ''}`).join(' | ')}`)
  console.log(`[AnimeAV1] Mejor match: "${best.candidate.title}" score=${best.score.toFixed(1)} gap=${gap.toFixed(1)}${best.aliasExact ? ' alias=true' : ''} accepted=${accepted}`)

  return {
    ...best,
    gap,
    accepted,
    aliasExact: best.aliasExact,
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
function isUsableHttpStreamUrlLocal(value) {
  if (typeof value !== 'string') return false
  const candidate = value.trim()
  if (!/^https?:\/\//i.test(candidate)) return false
  try {
    const parsed = new URL(candidate)
    if (!parsed.hostname || parsed.hostname === 'localhost') return false
    // Zilla sin el identificador del manifiesto produce una URL sintácticamente
    // válida, pero vacía: https://player.zilla-networks.com/m3u8/.
    if (/\/m3u8\/?$/i.test(parsed.pathname)) return false
    return true
  } catch (_) {
    return false
  }
}

async function extractZillaHLS(playUrl) {
  if (!isUsableHttpStreamUrlLocal(playUrl)) throw Error('URL de HLS vacía o inválida')
  const directUrl = playUrl.replace('/play/', '/m3u8/')
  if (!isUsableHttpStreamUrlLocal(directUrl)) throw Error('URL de HLS sin identificador de reproducción')
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
  const sourceUrl = typeof decoded.source === 'string' ? decoded.source.trim() : ''
  if (!isUsableHttpStreamUrlLocal(sourceUrl)) throw Error("El payload de Voe no trajo una URL HLS válida")

  console.log(`[Voe] HLS extraído: ${sourceUrl}`)
  return {
    url: sourceUrl,
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
async function resolveAnimeAV1LocalLegacy(tmdbId, type, season, episode) {
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

    // Matching 1.1.2: título por palabras + temporada + año de búsqueda.
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
    let candidates = await searchAnimeAV1(searchTerm, seasonYear, seasonNum)
    let matchInfo = pickBestMatch(candidates, searchTerm, seasonNum)

    // Si el primer intento no alcanza el umbral, usamos AniList como segunda
    // estrategia aunque TMDB sí haya proporcionado un año. Esto evita volver
    // silenciosamente al primer resultado cuando el título de TMDB y el
    // catálogo romaji de AnimeAV1 no coinciden bien.
    if (!matchInfo?.accepted && type !== "movie") {
      console.warn(`[AnimeAV1] Matching ambiguo para "${searchTerm}"; probando título romaji de AniList`)
      const aniListInfo = await getAniListInfo(info.title, seasonNum)
      if (aniListInfo && (aniListInfo.romajiTitle !== searchTerm || aniListInfo.year !== seasonYear)) {
        const retryYear = aniListInfo.year ?? seasonYear
        const retryTerm = aniListInfo.romajiTitle
        try {
          candidates = await searchAnimeAV1(retryTerm, retryYear, seasonNum)
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
          const sourceLabel = sourceKey === 'Voe' ? 'Voe 720p' : source.label
          const resolution = sourceKey === 'Voe' ? '720p' : '1080p'
          const label = `📺 ${sourceLabel}\n${resolution} | WEB-DL | Anime\n${getLangLabel(server.dub)}`
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


// ─────────────────────────────────────────────
// Resolver remoto principal + resolución local completa de respaldo (1.2.5)
// ─────────────────────────────────────────────

const ANIMEAV1_RESOLVER_URL = "https://animeav1-resolver.onrender.com"
const RESOLVER_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const LOCAL_RESOLVER_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const animeAV1RemoteCache = new Map()
const animeAV1LocalCache = new Map()

function resolverCacheKey(tmdbId, type, seasonNum) {
  return `${tmdbId}|${type}|${seasonNum}`
}

async function getRemoteAnimeIdentity(tmdbId, type, seasonNum) {
  const key = resolverCacheKey(tmdbId, type, seasonNum)
  const cached = animeAV1RemoteCache.get(key)
  if (cached && Date.now() - cached.timestamp < RESOLVER_CACHE_TTL_MS) {
    console.log(`[AnimeAV1] Caché del resolver remoto: ${cached.slug}`)
    return cached
  }
  if (cached) animeAV1RemoteCache.delete(key)

  const url = `${ANIMEAV1_RESOLVER_URL}/resolve?tmdbId=${encodeURIComponent(tmdbId)}&type=${encodeURIComponent(type)}&season=${encodeURIComponent(seasonNum)}`
  console.log(`[AnimeAV1] Resolver remoto: ${url}`)
  const response = await fetch(url)
  if (!response.ok) throw Error(`Resolver remoto HTTP ${response.status}`)
  const data = await response.json()
  if (!data || data.success !== true || typeof data.slug !== 'string' || !data.slug.trim()) {
    throw Error(data?.error || 'El resolver remoto no devolvió un slug válido')
  }

  const identity = {
    slug: data.slug.trim(),
    title: data.animeav1Title || '',
    score: typeof data.score === 'number' ? data.score : undefined,
    matchType: data.matchType || 'remote',
    timestamp: Date.now()
  }
  animeAV1RemoteCache.set(key, identity)
  console.log(`[AnimeAV1] Resolver remoto encontró "${identity.title || identity.slug}" slug=${identity.slug} score=${identity.score ?? '?'} tipo=${identity.matchType}`)
  return identity
}

async function getTMDBSeasonInfoLocal(tmdbId, seasonNum) {
  try {
    const url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=en-US`
    const response = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!response.ok) throw Error(`HTTP ${response.status}`)
    const data = await response.json()
    const airDate = data?.air_date || ''
    return {
      year: airDate ? new Date(airDate).getFullYear() : undefined,
      name: data?.name || data?.original_name || '',
      airDate
    }
  } catch (e) {
    console.warn(`[TMDB] Datos de temporada no disponibles para S${seasonNum}: ${e.message}`)
    return { year: undefined, name: '', airDate: '' }
  }
}

async function getTMDBAlternativeTitlesLocal(tmdbId, type) {
  try {
    const path = type === 'movie' ? 'movie' : 'tv'
    const url = `https://api.themoviedb.org/3/${path}/${tmdbId}/alternative_titles?api_key=${TMDB_API_KEY}`
    const response = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!response.ok) throw Error(`HTTP ${response.status}`)
    const data = await response.json()
    const rows = type === 'movie' ? data?.titles : data?.results
    if (!Array.isArray(rows)) return []
    const countries = new Set(['US', 'JP', 'KR', 'CN', 'TW', 'HK'])
    return uniqueLocalTitles(rows
      .filter((row) => row && typeof row.title === 'string' && row.title.trim().length >= 3 && (!row.iso_3166_1 || countries.has(row.iso_3166_1)))
      .map((row) => row.title), 8)
  } catch (e) {
    console.warn(`[TMDB] Títulos alternativos no disponibles: ${e.message}`)
    return []
  }
}

function uniqueLocalTitles(values, maxCount = 20) {
  const result = []
  const seen = new Set()
  for (const value of values || []) {
    const raw = String(value || '').trim()
    const key = normalizeTitle(raw)
    if (!key || key.length < 3 || seen.has(key)) continue
    if (/^(?:season\s*\d+|\d+(?:st|nd|rd|th)?\s+season|part\s*\d+)$/.test(key)) continue
    seen.add(key)
    result.push(raw)
    if (result.length >= maxCount) break
  }
  return result
}

async function fetchAniListCandidatesLocal(title) {
  const query = `query ($search: String) {
    Page(page: 1, perPage: 25) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
        id
        title { romaji english native }
        synonyms
        seasonYear
        startDate { year month day }
        format
      }
    }
  }`
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query, variables: { search: title } })
  })
  if (!response.ok) throw Error(`AniList HTTP ${response.status}`)
  const json = await response.json()
  const rows = json?.data?.Page?.media
  return Array.isArray(rows) ? rows : []
}

function scoreAniListCandidateLocal(media, sourceTitles, targetYear) {
  const title = media?.title || {}
  const named = [
    { value: title.romaji || '', synonym: false },
    { value: title.english || '', synonym: false },
    { value: title.native || '', synonym: false },
    ...(Array.isArray(media?.synonyms) ? media.synonyms.map((value) => ({ value: value || '', synonym: true })) : [])
  ]
  let titleScore = 0
  let matchType = 'title-similarity'
  for (const sourceTitle of sourceTitles) {
    const target = normalizeTitle(sourceTitle)
    if (!target) continue
    for (const name of named) {
      const candidate = normalizeTitle(name.value)
      if (!candidate) continue
      let score = 0
      if (candidate === target) score = name.synonym ? 130 : 120
      else if (target.length >= 5 && candidate.length >= 5 && (candidate.includes(target) || target.includes(candidate))) {
        score = 82 + (Math.min(target.length, candidate.length) / Math.max(target.length, candidate.length)) * 12
      } else {
        const targetTokens = new Set(titleTokens(sourceTitle))
        const candidateTokens = new Set(titleTokens(name.value))
        if (!targetTokens.size || !candidateTokens.size) continue
        let overlap = 0
        targetTokens.forEach((token) => { if (candidateTokens.has(token)) overlap++ })
        const coverage = overlap / targetTokens.size
        const precision = overlap / candidateTokens.size
        const symmetric = overlap ? 2 * overlap / (targetTokens.size + candidateTokens.size) : 0
        score = Math.max(coverage * 58 + precision * 12, symmetric * 78)
      }
      if (score > titleScore) {
        titleScore = score
        matchType = name.synonym && score >= 120 ? 'anilist-synonym' : (score >= 120 ? 'anilist-title' : 'title-similarity')
      }
    }
  }
  const year = Number(media?.seasonYear || media?.startDate?.year) || undefined
  let yearBonus = 0
  if (targetYear && year) {
    const diff = Math.abs(year - targetYear)
    if (diff === 0) yearBonus = 26
    else if (diff === 1) yearBonus = 12
    else if (diff === 2) yearBonus = 3
    else yearBonus = -Math.min(30, (diff - 2) * 5)
  }
  return { media, year, titleScore, score: titleScore + yearBonus, matchType }
}

async function resolveAniListIdentityLocal(info, seasonNum, targetYear, extraTitles) {
  const sourceTitles = uniqueLocalTitles([info?.title, info?.originalTitle, ...(extraTitles || [])], 12)
  const queries = uniqueLocalTitles([info?.title, info?.originalTitle, ...(extraTitles || [])], 3)
  if (!queries.length) return undefined
  const all = []
  for (const query of queries) {
    try {
      const rows = await fetchAniListCandidatesLocal(query)
      for (const row of rows) if (row?.id != null && !all.some((item) => item.id === row.id)) all.push(row)
    } catch (e) {
      console.warn(`[AniList] Búsqueda local "${query}" falló: ${e.message}`)
    }
  }
  if (!all.length) return undefined

  const scored = all.map((media) => scoreAniListCandidateLocal(media, sourceTitles, targetYear)).sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (!best || best.titleScore < 52) {
    console.warn(`[AniList] Ningún título alternativo alcanza confianza suficiente para "${info.title}"`)
    return undefined
  }

  // Si AniList devuelve varias entregas de la misma franquicia, seleccionamos
  // la que mejor corresponda al año de la temporada solicitada.
  const bestRomaji = best.media?.title?.romaji || ''
  const base = normalizeTitle(anilistBaseTitle(bestRomaji))
  const related = scored.filter((entry) => {
    const romaji = entry.media?.title?.romaji || ''
    return base && normalizeTitle(anilistBaseTitle(romaji)) === base
  })
  let selected = best
  if (related.length > 1 && targetYear) {
    related.sort((a, b) => {
      const da = a.year ? Math.abs(a.year - targetYear) : 9999
      const db = b.year ? Math.abs(b.year - targetYear) : 9999
      if (da !== db) return da - db
      return b.titleScore - a.titleScore
    })
    selected = related[0]
  } else if (related.length > 1 && seasonNum > 1) {
    related.sort((a, b) => {
      const da = a.media?.startDate || {}, db = b.media?.startDate || {}
      const ak = `${da.year || a.year || 9999}-${String(da.month || 1).padStart(2, '0')}-${String(da.day || 1).padStart(2, '0')}`
      const bk = `${db.year || b.year || 9999}-${String(db.month || 1).padStart(2, '0')}-${String(db.day || 1).padStart(2, '0')}`
      return ak.localeCompare(bk)
    })
    if (related.length >= seasonNum) selected = related[seasonNum - 1]
  }
  const media = selected.media
  const title = media?.title || {}
  console.log(`[AniList] Resolver local: "${title.romaji || title.english || '?'}" year=${selected.year || targetYear || '?'} score=${selected.score.toFixed(1)} match=${selected.matchType}`)
  return {
    year: selected.year || targetYear,
    romajiTitle: title.romaji || '',
    englishTitle: title.english || '',
    nativeTitle: title.native || '',
    synonyms: Array.isArray(media?.synonyms) ? media.synonyms : [],
    matchType: selected.matchType,
    score: selected.score
  }
}

async function extractAnimeAV1StreamsLocal(servers) {
  const sourceOrder = Object.keys(SOURCE_EXTRACTORS)
  const supported = servers.filter((server) => sourceOrder.some((key) => server.name.includes(key)))
  supported.sort((a, b) => {
    const ai = sourceOrder.findIndex((key) => a.name.includes(key))
    const bi = sourceOrder.findIndex((key) => b.name.includes(key))
    if (ai !== bi) return ai - bi
    return (a.dub ? 1 : 0) - (b.dub ? 1 : 0)
  })
  const groups = await Promise.all(supported.map(async (server) => {
    const sourceKey = Object.keys(SOURCE_EXTRACTORS).find((key) => server.name.includes(key))
    const source = sourceKey ? SOURCE_EXTRACTORS[sourceKey] : null
    if (!source) return []
    try {
      const resolved = await source.extract(server.url)
      const variants = Array.isArray(resolved) ? resolved : [resolved]
      return variants.filter((variant) => isUsableHttpStreamUrlLocal(variant?.url)).map((variant) => ({
        name: 'AnimeAV1',
        title: '',
        url: variant.url.trim(),
        quality: `📺 ${sourceKey === 'Voe' ? 'Voe 720p' : source.label}\n${sourceKey === 'Voe' ? '720p' : '1080p'} | WEB-DL | Anime\n${getLangLabel(server.dub)}`,
        headers: variant.headers,
        ...(variant.type ? { type: variant.type } : {})
      }))
    } catch (e) {
      console.warn(`[${source.label}] Falló resolviendo un servidor: ${e.message}`)
      return []
    }
  }))
  const all = groups.flat()
  const seen = new Set()
  return all.filter((stream) => {
    const key = `${stream.url}|${stream.quality}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function fetchStreamsForSlugLocal(slug, type, epNumber) {
  // AnimeAV1 etiqueta algunas películas como Episodio 0 (confirmado en la
  // ficha de Circe no Majo). Para películas probamos 0 primero y solo usamos
  // 1 si el episodio 0 no contiene servidores ni produce URLs HLS utilizables.
  const episodeCandidates = type === 'movie'
    ? [...new Set([0, epNumber])]
    : [epNumber]

  for (const candidateEp of episodeCandidates) {
    let servers = []
    try {
      servers = await getEpisodeServers(slug, candidateEp)
    } catch (e) {
      console.warn(`[AnimeAV1] No se pudieron leer servidores de ${slug}/E${candidateEp}: ${e.message}`)
    }
    if (!servers.length) {
      console.warn(`[AnimeAV1] ${slug}/E${candidateEp} no contiene servidores soportados; probando alternativa`)
      continue
    }

    const streams = await extractAnimeAV1StreamsLocal(servers).catch((e) => {
      console.warn(`[AnimeAV1] Falló la extracción de ${slug}/E${candidateEp}: ${e.message}`)
      return []
    })
    const usableStreams = (streams || []).filter((stream) => isUsableHttpStreamUrlLocal(stream?.url))
    if (usableStreams.length) {
      console.log(`[AnimeAV1] Episodio elegido ${slug}/E${candidateEp}: ${usableStreams.length} URL(s) HLS válidas`)
      return usableStreams
    }
    console.warn(`[AnimeAV1] ${slug}/E${candidateEp} detectó servidores pero no produjo URLs HLS utilizables; probando alternativa`)
  }
  return []
}

async function resolveAnimeAV1LocalFresh(tmdbId, type, seasonNum, epNumber, cacheKey) {
  console.log(`[AnimeAV1] Fallback local 1.2.5: TMDB ${tmdbId} (${type}) S${seasonNum}E${epNumber}`)
  const seasonPromise = type === 'movie'
    ? Promise.resolve({ year: undefined, name: '', airDate: '' })
    : getTMDBSeasonInfoLocal(tmdbId, seasonNum)
  const [info, seasonInfo, altTitles] = await Promise.all([
    getTMDBInfo(tmdbId, type), seasonPromise, getTMDBAlternativeTitlesLocal(tmdbId, type)
  ])
  if (!info) {
    console.warn(`[AnimeAV1] TMDB no devolvió información para ${tmdbId}`)
    return []
  }
  if (!looksLikeAnime(info)) {
    console.warn(`[AnimeAV1] Contenido descartado por filtro de anime: "${info.title}"`)
    return []
  }
  const seasonYear = type === 'movie' ? info.year : (seasonInfo.year || info.year)
  const directTerms = uniqueLocalTitles([
    seasonNum > 1 && type !== 'movie' ? `${info.title} ${seasonNum}` : info.title,
    info.title, info.originalTitle, seasonInfo.name, ...(altTitles || [])
  ], 12)
  const triedTerms = new Set()
  const triedSlugs = new Set()

  const tryTerms = async (terms, yearToUse, origin) => {
    for (const termValue of terms) {
      const term = typeof termValue === 'string' ? termValue : termValue.term
      const termOrigin = typeof termValue === 'string' ? origin : (termValue.origin || origin)
      const normalized = normalizeTitle(term)
      if (!normalized || triedTerms.has(`${normalized}|${yearToUse || ''}`)) continue
      triedTerms.add(`${normalized}|${yearToUse || ''}`)
      const yearsToTry = yearToUse ? [yearToUse, undefined] : [undefined]
      for (const year of yearsToTry) {
        let candidates
        try {
          candidates = await searchAnimeAV1(term, year, seasonNum)
        } catch (e) {
          console.warn(`[AnimeAV1] Búsqueda local "${term}" falló: ${e.message}`)
          continue
        }
        const matchInfo = pickBestMatch(candidates, term, seasonNum)
        if (!matchInfo) continue
        // En temporadas posteriores, un título fuerte dentro de una búsqueda
        // filtrada por el año de TMDB también es evidencia válida aunque el
        // catálogo no escriba literalmente “Season N” en el título.
        if (!matchInfo.accepted && year && seasonNum > 1 && matchInfo.candidateSeason === undefined && matchInfo.score >= 85) {
          matchInfo.accepted = true
          console.log(`[AnimeAV1] Coincidencia aceptada por título + año TMDB: "${matchInfo.candidate.title}" score=${matchInfo.score.toFixed(1)}`)
        }
        const match = matchInfo.candidate
        if (!matchInfo.accepted || !match?.slug || triedSlugs.has(match.slug)) continue
        triedSlugs.add(match.slug)
        console.log(`[AnimeAV1] Match local (${termOrigin}): "${match.title}" slug=${match.slug} score=${matchInfo.score.toFixed(1)} term="${term}"`)
        const streams = await fetchStreamsForSlugLocal(match.slug, type, epNumber).catch((e) => {
          console.warn(`[AnimeAV1] Error probando slug "${match.slug}": ${e.message}`)
          return []
        })
        if (streams.length) {
          animeAV1LocalCache.set(cacheKey, { slug: match.slug, title: match.title, score: matchInfo.score, timestamp: Date.now() })
          console.log(`[AnimeAV1] ✓ Resolver local encontró ${streams.length} streams`)
          return streams
        }
        console.warn(`[AnimeAV1] El candidato "${match.title}" no produjo streams; se probará otra alternativa`)
      }
    }
    return []
  }

  console.log(`[AnimeAV1] Resolución local por TMDB: títulos=${directTerms.join(' | ')} año=${seasonYear || 'ninguno'}`)
  let streams = await tryTerms(directTerms, seasonYear, 'TMDB')
  if (streams.length) return streams

  console.warn('[AnimeAV1] Búsqueda directa sin streams; se activa cruce AniList/sinónimos')
  const aliInfo = await resolveAniListIdentityLocal(info, seasonNum, seasonYear, [seasonInfo.name, ...(altTitles || [])])
  if (!aliInfo) {
    // Conserva la ruta AniList histórica como última alternativa cuando no se
    // puede obtener una identidad con títulos y sinónimos estructurados.
    const legacyInfo = await getAniListInfo(info.title, seasonNum)
    if (!legacyInfo) return []
    const legacyTerms = uniqueLocalTitles([legacyInfo.romajiTitle, info.title, info.originalTitle, ...(altTitles || [])], 8)
    streams = await tryTerms(legacyTerms, legacyInfo.year || seasonYear, 'AniList histórico')
    if (streams.length) return streams
    return []
  }

  const synonymSet = new Set((aliInfo.synonyms || []).map(normalizeTitle))
  const aliasTerms = uniqueLocalTitles([
    aliInfo.romajiTitle, aliInfo.englishTitle, aliInfo.nativeTitle,
    seasonInfo.name, info.title, info.originalTitle,
    ...(aliInfo.synonyms || []), ...(altTitles || [])
  ], 24).map((term) => ({ term, origin: synonymSet.has(normalizeTitle(term)) ? 'sinónimo AniList' : 'AniList/TMDB' }))
  console.log(`[AnimeAV1] Segunda fase local: AniList ${aliInfo.matchType}; año=${aliInfo.year || seasonYear || 'ninguno'}; títulos=${aliasTerms.map((item) => item.term).join(' | ')}`)
  streams = await tryTerms(aliasTerms, aliInfo.year || seasonYear, 'AniList/TMDB')
  if (!streams.length) console.warn(`[AnimeAV1] Resolver local no pudo obtener streams para TMDB ${tmdbId} S${seasonNum}E${epNumber}`)
  return streams
}

async function resolveAnimeAV1Local(tmdbId, type, season, episode) {
  if (!tmdbId || !type) return []
  const seasonNum = type === 'movie' ? 1 : (season ? Number(season) : 1)
  const epNumber = type === 'movie' ? 1 : (episode !== undefined ? Number(episode) : 1)
  const key = resolverCacheKey(tmdbId, type, seasonNum)
  const cached = animeAV1LocalCache.get(key)
  if (cached && Date.now() - cached.timestamp < LOCAL_RESOLVER_CACHE_TTL_MS) {
    console.log(`[AnimeAV1] Caché del resolver local: TMDB ${tmdbId} S${seasonNum} -> ${cached.slug}`)
    const streams = await fetchStreamsForSlugLocal(cached.slug, type, epNumber).catch(() => [])
    if (streams.length) return streams
    animeAV1LocalCache.delete(key)
    console.warn('[AnimeAV1] Caché local sin streams; se vuelve a resolver')
  } else if (cached) animeAV1LocalCache.delete(key)

  try {
    return await resolveAnimeAV1LocalFresh(tmdbId, type, seasonNum, epNumber, key)
  } catch (e) {
    console.error(`[AnimeAV1] Error del fallback local: ${e.message}`)
    // Ultima oportunidad: el método local previo, conservado sin tocar sus
    // extractores, ayuda a evitar regresiones en casos ya soportados.
    try { return await resolveAnimeAV1LocalLegacy(tmdbId, type, seasonNum, epNumber) } catch (legacyError) {
      console.error(`[AnimeAV1] Método local heredado falló: ${legacyError.message}`)
      return []
    }
  }
}

exports.getStreams = async function (tmdbId, type, season, episode) {
  if (!tmdbId || !type) return []
  const seasonNum = type === 'movie' ? 1 : (season ? Number(season) : 1)
  const epNumber = type === 'movie' ? 1 : (episode !== undefined ? Number(episode) : 1)
  console.log(`[AnimeAV1] 1.2.5 Resolviendo: TMDB ${tmdbId} (${type}) S${seasonNum}E${epNumber}`)

  try {
    const identity = await getRemoteAnimeIdentity(tmdbId, type, seasonNum)
    let streams = await fetchStreamsForSlugLocal(identity.slug, type, epNumber)
    if (streams.length) {
      console.log(`[AnimeAV1] ✓ Resolver remoto confirmó slug "${identity.slug}" y entregó ${streams.length} streams`)
      return streams
    }
    console.warn(`[AnimeAV1] El resolver remoto devolvió slug "${identity.slug}" pero no streams; se activa fallback local`)
    animeAV1RemoteCache.delete(resolverCacheKey(tmdbId, type, seasonNum))
  } catch (e) {
    console.warn(`[AnimeAV1] Resolver remoto falló: ${e.message}; se activa fallback local`)
  }

  try {
    const streams = await resolveAnimeAV1Local(tmdbId, type, seasonNum, epNumber)
    if (streams.length) console.log(`[AnimeAV1] ✓ Fallback local devolvió ${streams.length} streams`)
    return streams || []
  } catch (e) {
    console.error(`[AnimeAV1] Falló el flujo remoto/local: ${e.message}`)
    return []
  }
}
