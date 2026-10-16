// providers/animeav1.js
// Provider Nuvio para AnimeAV1 (https://animeav1.com)
// Sources activos: HLS de Zilla y HLS de Voe.
//
// Contrato Nuvio: exports.getStreams(tmdbId, type, season, episode) -> Promise<Array<Stream>>
// Stream: { name, title, url, quality, headers? }
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const ANIMEAV1_BASE = "https://animeav1.com";
const TMDB_API_KEY = "56db0ec297530920213e1503706b81ff";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
// Switch de sources: true/false para activar o desactivar cada uno sin tocar
// el resto del código. Se aplica al registrar SOURCE_EXTRACTORS más abajo —
// un source en false ni siquiera se prueba/extrae para ese episodio.
const ENABLED_SOURCES = {
    HLS: true,
    Voe: true,
};
// Servidores soportados: nombre tal como aparece en el HTML/__data.json de
// AnimeAV1 -> función extractora que resuelve el link directo reproducible.
// Para sumar un nuevo source: 1) agregar su extractor más abajo, 2) agregarlo
// al registro (con su entrada en ENABLED_SOURCES si quieres poder apagarlo).
const SOURCE_EXTRACTORS = {}; // se completa al final del archivo, una vez definidos los extractores
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
function getTMDBInfo(tmdbId, type) {
    return __awaiter(this, void 0, void 0, function* () {
        const path = type === "movie" ? "movie" : "tv";
        const url = `https://api.themoviedb.org/3/${path}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
        const data = yield fetch(url, { headers: { "User-Agent": UA } }).then((r) => r.json());
        if (!data || data.success === false)
            return null;
        const title = data.title || data.name || data.original_title || data.original_name;
        const dateStr = data.release_date || data.first_air_date;
        const year = dateStr ? new Date(dateStr).getFullYear() : undefined;
        if (!title)
            return null;
        // origin_country: en /tv/{id} viene directo como array de códigos ISO
        // (ej. ["JP"]); en /movie/{id} no existe ese campo, el equivalente es
        // production_countries (array de {iso_3166_1, name}).
        const originCountries = type === "movie"
            ? (data.production_countries || []).map((c) => c.iso_3166_1)
            : (data.origin_country || []);
        // genres ya viene incluido en esta misma respuesta (sin request extra).
        // Genre ID 16 = "Animation" en TMDB — no existe un género "Anime" separado,
        // así que se usa como señal complementaria al país de origen (patrón
        // recomendado por la propia comunidad de TMDB: Animation + Japón ≈ anime).
        const genreIds = (data.genres || []).map((g) => g.id);
        const isAnimation = genreIds.includes(16);
        const originalTitle = data.original_title || data.original_name || title;
        return { title, originalTitle, year, originCountries, isAnimation };
    });
}
// Países de origen asociados a anime/animación asiática en TMDB. Se usa para
// descartar temprano contenido que claramente no es anime (ahorra requests
// inútiles a AnimeAV1 cuando alguien busca, por ejemplo, una serie occidental).
const ASIAN_COUNTRIES = ['JP', 'CN', 'KR', 'TW', 'HK'];
function looksLikeAsianOrigin(originCountries) {
    // Si TMDB no dio el dato, no bloqueamos — es mejor intentar la búsqueda
    // igual que descartar por falta de información.
    if (!Array.isArray(originCountries) || originCountries.length === 0)
        return true;
    return originCountries.some((c) => ASIAN_COUNTRIES.includes(c));
}
/**
 * Filtro combinado: país asiático Y género Animation. Refuerza el filtro de
 * origen — descarta, por ejemplo, dramas o series live-action japonesas que
 * no son anime, además de contenido occidental. Si TMDB no trajo `genres`
 * (no debería pasar en /movie/{id} o /tv/{id}, pero por seguridad), no
 * bloqueamos solo por eso.
 */
function looksLikeAnime(info) {
    if (!looksLikeAsianOrigin(info.originCountries))
        return false;
    if (info.isAnimation === false)
        return false;
    return true;
}
/**
 * Año de emisión de una temporada específica, vía TMDB /tv/{id}/season/{n}.
 * Es la pieza clave para distinguir temporadas: AnimeAV1 no organiza por
 * temporada dentro de un slug, así que buscamos por año + título para
 * encontrar la entrada correcta del catálogo (cada temporada suele ser una
 * entrada de catálogo separada).
 */
function getSeasonYear(tmdbId, seasonNum) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=en-US`;
            const data = yield fetch(url, { headers: { "User-Agent": UA } }).then((r) => {
                if (!r.ok)
                    throw Error(`HTTP error! Status: ${r.status}`);
                return r.json();
            });
            const airDate = data === null || data === void 0 ? void 0 : data.air_date;
            const year = airDate ? new Date(airDate).getFullYear() : undefined;
            console.log(`[TMDB] Temporada ${seasonNum}: air_date="${airDate}" -> year=${year}`);
            return year;
        }
        catch (e) {
            console.warn(`[TMDB] getSeasonYear falló (temporada ${seasonNum}): ${e.message}`);
            return undefined;
        }
    });
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
const ANILIST_SEASON_SUFFIX_RE = /\s+(?:\d+(?:st|nd|rd|th)\s+season|season\s+\d+(?:\s+part\s+\d+)?|part\s+\d+)\s*$/i;
function anilistBaseTitle(romaji) {
    return romaji.replace(ANILIST_SEASON_SUFFIX_RE, '').trim();
}
function getAniListInfo(title, seasonNum) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
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
    }`;
            const resp = yield fetch("https://graphql.anilist.co", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ query, variables: { search: title } })
            });
            if (!resp.ok)
                throw Error(`HTTP error! Status: ${resp.status}`);
            const json = yield resp.json();
            const results = (_b = (_a = json === null || json === void 0 ? void 0 : json.data) === null || _a === void 0 ? void 0 : _a.Page) === null || _b === void 0 ? void 0 : _b.media;
            if (!Array.isArray(results) || results.length === 0) {
                console.warn(`[AniList] Sin resultados para "${title}"`);
                return undefined;
            }
            const anchor = results[0];
            const baseRomaji = anilistBaseTitle(((_c = anchor.title) === null || _c === void 0 ? void 0 : _c.romaji) || '');
            if (!baseRomaji)
                return undefined;
            const sameSeries = results.filter((m) => { var _a; return anilistBaseTitle(((_a = m.title) === null || _a === void 0 ? void 0 : _a.romaji) || '').toLowerCase() === baseRomaji.toLowerCase(); });
            const withDate = sameSeries
                .map((m) => {
                var _a, _b;
                const sd = m.startDate;
                const year = (_a = m.seasonYear) !== null && _a !== void 0 ? _a : sd === null || sd === void 0 ? void 0 : sd.year;
                if (!year)
                    return null;
                const sortKey = (sd === null || sd === void 0 ? void 0 : sd.year) ? `${sd.year}-${String(sd.month || 1).padStart(2, '0')}-${String(sd.day || 1).padStart(2, '0')}` : `${year}-01-01`;
                return { title: (_b = m.title) === null || _b === void 0 ? void 0 : _b.romaji, year, sortKey };
            })
                .filter(Boolean)
                .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
            console.log(`[AniList] "${baseRomaji}" — ${withDate.length} temporada(s) encontradas: ${withDate.map(w => `${w.title}(${w.year})`).join(', ')}`);
            const target = withDate[seasonNum - 1];
            if (!target) {
                console.warn(`[AniList] No hay entrada para temporada ${seasonNum} (solo ${withDate.length} encontradas)`);
                return undefined;
            }
            console.log(`[AniList] Temporada ${seasonNum} -> "${target.title}" year=${target.year}`);
            return { year: target.year, romajiTitle: target.title };
        }
        catch (e) {
            console.warn(`[AniList] getAniListInfo falló: ${e.message}`);
            return undefined;
        }
    });
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
        .trim();
}
function buildSearchURL(query, page, year) {
    const params = new URLSearchParams();
    if (query)
        params.set('search', query);
    if (year) {
        params.set('minYear', year);
        params.set('maxYear', year);
    }
    if (page)
        params.set('page', page);
    return `${ANIMEAV1_BASE}/catalogo?${params.toString()}`;
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
function searchAnimesBySpecificURL(url) {
    return __awaiter(this, void 0, void 0, function* () {
        const html = yield fetch(url, { headers: { "User-Agent": UA } }).then((resp) => {
            if (!resp.ok)
                throw Error(`HTTP error! Status: ${resp.status}`);
            return resp.text();
        });
        // Cada resultado sigue el patrón: { id: "X", title: "Y", synopsis: "Z", categoryId: N, slug: "W" ...
        // synopsis puede contener comillas escapadas (\") y saltos de línea (\n), contemplados en el regex.
        const objBlockRegex = /\{\s*id:\s*"([^"]+)",\s*title:\s*"((?:[^"\\]|\\.)*)",\s*synopsis:\s*"((?:[^"\\]|\\.)*)",\s*categoryId:\s*\d+,\s*slug:\s*"([^"]+)"/g;
        const media = [];
        let m;
        while ((m = objBlockRegex.exec(html)) !== null) {
            media.push({
                id: m[1],
                title: m[2].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
                synopsis: m[3].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
                slug: m[4]
            });
        }
        return { media };
    });
}
/**
 * Busca un anime en AnimeAV1 probando: query original, sanitizada, primeras 3 palabras.
 * @returns {Promise<Array>}
 */
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_CACHE_MAX_ENTRIES = 1000;
const animeAV1SearchCache = new Map();
function maintainAnimeAV1SearchCache(now = Date.now()) {
    for (const [key, entry] of animeAV1SearchCache) {
        if (now - entry.timestamp >= SEARCH_CACHE_TTL_MS)
            animeAV1SearchCache.delete(key);
    }
    while (animeAV1SearchCache.size >= SEARCH_CACHE_MAX_ENTRIES) {
        const oldestKey = animeAV1SearchCache.keys().next().value;
        if (oldestKey === undefined)
            break;
        animeAV1SearchCache.delete(oldestKey);
    }
}
function isStrongSearchMatch(candidates, searchTerm, seasonNum) {
    const match = pickBestMatch(candidates, searchTerm, seasonNum);
    // For S2+, an unmarked result is not considered strong merely because its
    // text score is high; AniList must verify its seasonal identity separately.
    return Boolean(match === null || match === void 0 ? void 0 : match.accepted);
}
/**
 * Search the AnimeAV1 catalog with a bounded progression of equivalent terms.
 * Cache keys are normalized, cache misses are cached too, and variants stop as
 * soon as catalog metadata confirms a safe match.
 */
function searchAnimeAV1(query_1, year_1) {
    return __awaiter(this, arguments, void 0, function* (query, year, seasonNum = 1) {
        const runSearch = (searchQuery) => __awaiter(this, void 0, void 0, function* () {
            const normalizedQuery = normalizeTitle(searchQuery);
            const cacheKey = `${normalizedQuery}|${year !== null && year !== void 0 ? year : ''}`;
            const cached = animeAV1SearchCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
                // Touch the key to keep frequently-used entries away from the eviction end.
                animeAV1SearchCache.delete(cacheKey);
                animeAV1SearchCache.set(cacheKey, cached);
                console.log(`[AnimeAV1] Caché búsqueda: "${searchQuery}"`);
                return cached.media;
            }
            if (cached)
                animeAV1SearchCache.delete(cacheKey);
            const data = yield searchAnimesBySpecificURL(buildSearchURL(searchQuery, undefined, year));
            const media = Array.isArray(data === null || data === void 0 ? void 0 : data.media) ? data.media : [];
            maintainAnimeAV1SearchCache();
            animeAV1SearchCache.set(cacheKey, { timestamp: Date.now(), media });
            return media;
        });
        const sanitized = sanitizeQuery(query);
        const variants = uniqueLocalTitles([
            query,
            sanitized,
            (sanitized || query).split(' ').filter(Boolean).slice(0, 3).join(' ')
        ], 3);
        const aggregate = [];
        const seen = new Set();
        for (const variant of variants) {
            let rows;
            try {
                rows = yield runSearch(variant);
            }
            catch (e) {
                console.warn(`[AnimeAV1] Variante de búsqueda "${variant}" falló: ${e.message}`);
                // Empty catalog results are cached as []. Exceptions mean transport/HTTP
                // failure, so retrying equivalent variants would only multiply requests.
                throw e;
            }
            for (const candidate of rows) {
                const key = (candidate === null || candidate === void 0 ? void 0 : candidate.slug) || (candidate === null || candidate === void 0 ? void 0 : candidate.id) || normalizeTitle(candidate === null || candidate === void 0 ? void 0 : candidate.title);
                if (!key || seen.has(key))
                    continue;
                seen.add(key);
                aggregate.push(candidate);
            }
            const strongMatch = pickBestMatch(aggregate, query, seasonNum);
            const exactFullTitle = aggregate.some((candidate) => {
                if (normalizeTitle(candidate === null || candidate === void 0 ? void 0 : candidate.title) !== normalizeTitle(query))
                    return false;
                const candidateSeason = getExplicitSeason(`${(candidate === null || candidate === void 0 ? void 0 : candidate.title) || ''} ${(candidate === null || candidate === void 0 ? void 0 : candidate.slug) || ''}`);
                return candidateSeason === undefined || candidateSeason === seasonNum;
            });
            if ((strongMatch === null || strongMatch === void 0 ? void 0 : strongMatch.accepted) || exactFullTitle)
                return aggregate;
        }
        return aggregate;
    });
}
// Patrones que indican temporada 2+ en el título del catálogo.
const HIGHER_SEASON_PATTERNS = [
    /\b2nd\s+season\b/i, /\b3rd\s+season\b/i, /\b4th\s+season\b/i,
    /\bseason\s+[2-9]\b/i, /\bpart\s+[2-9]\b/i,
    /\b[2-9]\s*(?:st|nd|rd|th)?\s+temporada\b/i,
];
const STOP_WORDS = new Set([
    'the', 'a', 'an', 'of', 'and', 'to', 'in', 'on', 'for', 'no', 'na',
    'la', 'el', 'los', 'las', 'de', 'del', 'y', 'en', 'con', 'part',
    'season', 'temporada', 'cour', 'arc'
]);
function normalizeTitle(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[’'`´]/g, '')
        .replace(/[-–—_:.,!?()[\]{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function titleTokens(s) {
    return normalizeTitle(s)
        .split(' ')
        .filter((token) => token && !STOP_WORDS.has(token));
}
function getExplicitSeason(title) {
    const value = normalizeTitle(title);
    let m = value.match(/\bseason\s*(\d+)\b/);
    if (m)
        return Number(m[1]);
    m = value.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b/);
    if (m)
        return Number(m[1]);
    m = value.match(/\b(?:s|t)\s*(\d+)\b/);
    if (m)
        return Number(m[1]);
    m = value.match(/\b(\d+)(?:st|nd|rd|th)?\s+temporada\b/);
    if (m)
        return Number(m[1]);
    // Some Japanese/Chinese catalogue aliases use 第三季 / 第三期 instead
    // of a Latin ordinal. Keep the raw string because normalizeTitle preserves it.
    const raw = String(title || '');
    m = raw.match(/第\s*(\d+)\s*(?:期|季)/);
    if (m)
        return Number(m[1]);
    m = raw.match(/第\s*([一二三四五六七八九十百]+)\s*(?:期|季)/);
    if (m) {
        const digits = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
        const numeral = m[1];
        if (digits[numeral] != null)
            return digits[numeral];
        if (numeral.startsWith('十'))
            return 10 + (digits[numeral.slice(1)] || 0);
        if (numeral.includes('十')) {
            const [tens, ones] = numeral.split('十');
            return (digits[tens] || 1) * 10 + (digits[ones] || 0);
        }
    }
    return undefined;
}
function wordSimilarity(target, candidate) {
    const targetTokens = [...new Set(titleTokens(target))];
    const candidateTokens = new Set(titleTokens(candidate));
    if (!targetTokens.length)
        return 0;
    let matched = 0;
    for (const token of targetTokens) {
        if (candidateTokens.has(token))
            matched++;
    }
    return matched / targetTokens.length;
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
    const raw = String(target || '').trim();
    if (!raw)
        return [];
    const aliases = [];
    const add = (value) => {
        const normalized = normalizeTitle(value);
        if (!normalized || normalized.length < 3)
            return;
        if (!aliases.includes(normalized))
            aliases.push(normalized);
    };
    // Alias/título corto al comienzo del título largo.
    const prefix = raw.match(/^\s*(.+?)\s*(?:~|:|\s[-–—]\s|\(|\[)/);
    if (prefix)
        add(prefix[1]);
    // En títulos que usan comillas alrededor de un subtítulo, conserva también
    // el texto que queda antes de la primera comilla/apertura delimitadora.
    const quotedPrefix = raw.match(/^\s*(.+?)\s*(?:["“”]|«)/);
    if (quotedPrefix)
        add(quotedPrefix[1]);
    return aliases;
}
function getAliasExactMatch(target, candidate) {
    const normalizedCandidate = normalizeTitle(candidate);
    if (!normalizedCandidate)
        return undefined;
    return getTitleAliases(target).find((alias) => alias === normalizedCandidate);
}
/**
 * Puntúa un candidato usando coincidencia por palabras + alias + temporada.
 * El año se utiliza en la consulta a AnimeAV1 (minYear/maxYear), por lo que
 * no se inventa una puntuación de año que el resultado del catálogo no expone.
 *
 * Devuelve { candidate, score, similarity, candidateSeason }.
 */
function scoreCandidate(candidate, searchTerm, seasonNum) {
    const candidateTitle = (candidate === null || candidate === void 0 ? void 0 : candidate.title) || '';
    // AnimeAV1 sometimes omits the season from the display title but keeps it
    // in the slug. Use both for season classification, never for title equality.
    const candidateIdentity = `${candidateTitle} ${(candidate === null || candidate === void 0 ? void 0 : candidate.slug) || ''}`.trim();
    const target = normalizeTitle(searchTerm);
    const normalizedCandidate = normalizeTitle(candidateTitle);
    const similarity = wordSimilarity(searchTerm, candidateTitle);
    const aliasExact = getAliasExactMatch(searchTerm, candidateTitle);
    const explicitSeason = getExplicitSeason(candidateIdentity);
    let score = similarity * 60;
    if (normalizedCandidate === target)
        score += 30;
    if (aliasExact && seasonNum === 1)
        score = Math.max(score, 100);
    if (seasonNum > 1) {
        if (explicitSeason === seasonNum)
            score += 45;
        else if (explicitSeason !== undefined)
            score -= 45;
        const targetHasSeasonNumber = new RegExp(`\\b${seasonNum}\\b`).test(target);
        if (targetHasSeasonNumber && new RegExp(`\\b${seasonNum}\\b`).test(normalizedCandidate))
            score += 15;
    }
    else if (explicitSeason !== undefined && explicitSeason > 1) {
        score -= 55;
    }
    return { candidate, score, similarity, candidateSeason: explicitSeason, aliasExact };
}
function pickBestMatch(candidates, searchTerm, seasonNum) {
    if (!Array.isArray(candidates) || candidates.length === 0)
        return null;
    const scored = candidates
        .map((candidate) => scoreCandidate(candidate, searchTerm, seasonNum))
        .sort((a, b) => b.score - a.score);
    // A wrong-season marker must never outrank a markerless candidate that may
    // later be verified by AniList, nor mask a valid result later in the catalog.
    const seasonCompatible = scored.filter((entry) => entry.candidateSeason === undefined || entry.candidateSeason === seasonNum);
    let pool = seasonCompatible.length ? seasonCompatible : scored;
    if (seasonNum > 1) {
        const explicit = pool.filter((entry) => entry.candidateSeason === seasonNum && entry.score >= 65);
        if (explicit.length)
            pool = explicit;
    }
    pool.sort((a, b) => b.score - a.score);
    const best = pool[0];
    const second = pool[1];
    const gap = second ? best.score - second.score : best.score;
    const hasExpectedSeason = seasonNum === 1
        ? best.candidateSeason === undefined || best.candidateSeason === 1
        : best.candidateSeason === seasonNum;
    const threshold = seasonNum > 1 ? 65 : 50;
    const accepted = best.score >= threshold && hasExpectedSeason;
    return Object.assign(Object.assign({}, best), { gap, accepted, candidates: scored });
}
// ─────────────────────────────────────────────
// Extracción de servidores del episodio (__data.json + fallback HTML)
// ─────────────────────────────────────────────
/**
 * Obtiene la lista de servidores (embeds SUB/DUB) de un episodio dado.
 * Solo interesan los servidores HLS de Zilla y Voe.
 */
function getEpisodeServers(slug, epNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const ep = (epNumber !== undefined && epNumber !== null) ? Number(epNumber) : 1;
        const pageUrl = `${ANIMEAV1_BASE}/media/${slug}/${ep}`;
        console.log(`[AnimeAV1] GetEpisodeServers: ${pageUrl}`);
        // ── Método primario: __data.json ──────────────────────────────────────
        try {
            const jsonUrl = `${pageUrl}/__data.json`;
            const resp = yield fetch(jsonUrl, { headers: { "User-Agent": UA, "Referer": ANIMEAV1_BASE + "/" } });
            if (!resp.ok)
                throw Error(`HTTP error! Status: ${resp.status}`);
            const root = yield resp.json();
            const nodes = root === null || root === void 0 ? void 0 : root.nodes;
            if (!Array.isArray(nodes))
                throw Error("No nodes in __data.json");
            let dataArray = null;
            for (const node of nodes) {
                if ((node === null || node === void 0 ? void 0 : node.data) && Array.isArray(node.data)) {
                    const hasEmbeds = node.data.some(d => d && typeof d === 'object' && 'embeds' in d);
                    if (hasEmbeds) {
                        dataArray = node.data;
                        break;
                    }
                }
            }
            if (!dataArray)
                throw Error("No data array with embeds found");
            const episodeObj = dataArray.find(d => d && typeof d === 'object' && 'embeds' in d);
            if (!episodeObj)
                throw Error("No episode object found");
            const embedsIndex = episodeObj.embeds;
            const embeds = dataArray[embedsIndex];
            if (!embeds || typeof embeds !== 'object')
                throw Error("No embeds object");
            const servers = [];
            function matchesSupportedSource(name) {
                return Object.keys(SOURCE_EXTRACTORS).some((key) => name.includes(key));
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
                    const resolved = dataArray[value];
                    if (typeof resolved === 'string')
                        return resolved;
                }
                if (typeof value === 'string')
                    return value;
                return null;
            }
            function resolveServer(entry) {
                try {
                    // `entry` puede ser un índice hacia un objeto {server, url}, o el objeto ya resuelto.
                    const obj = typeof entry === 'number' ? dataArray[entry] : entry;
                    if (!obj || typeof obj !== 'object')
                        return null;
                    const serverName = resolveField(obj.server);
                    const url = resolveField(obj.url);
                    if (typeof serverName !== 'string' || typeof url !== 'string')
                        return null;
                    return { name: serverName, url };
                }
                catch (_) {
                    return null;
                }
            }
            function extractServers(listOrIndex, dub) {
                const list = typeof listOrIndex === 'number' ? dataArray[listOrIndex] : listOrIndex;
                if (!Array.isArray(list))
                    return;
                for (const entry of list) {
                    const server = resolveServer(entry);
                    if (!server || !server.url.startsWith('http'))
                        continue;
                    if (!matchesSupportedSource(server.name))
                        continue; // ── solo sources soportados ──
                    servers.push({ name: server.name, url: server.url, dub });
                    console.log(`[AnimeAV1] Servidor detectado: ${server.name} (${dub ? 'DUB' : 'SUB'})`);
                }
            }
            const subIndex = (_a = embeds.SUB) !== null && _a !== void 0 ? _a : embeds.sub;
            const dubIndex = (_b = embeds.DUB) !== null && _b !== void 0 ? _b : embeds.dub;
            if (subIndex !== undefined)
                extractServers(subIndex, false);
            if (dubIndex !== undefined)
                extractServers(dubIndex, true);
            // Algunos episodios exponen sources como "download" en vez de "embed"
            const downloadsIndex = episodeObj.downloads;
            if (downloadsIndex !== undefined) {
                const downloads = dataArray[downloadsIndex];
                if (downloads && typeof downloads === 'object') {
                    const dlSubIndex = (_c = downloads.SUB) !== null && _c !== void 0 ? _c : downloads.sub;
                    const dlDubIndex = (_d = downloads.DUB) !== null && _d !== void 0 ? _d : downloads.dub;
                    if (dlSubIndex !== undefined)
                        extractServers(dlSubIndex, false);
                    if (dlDubIndex !== undefined)
                        extractServers(dlDubIndex, true);
                }
            }
            if (servers.length > 0) {
                console.log(`[AnimeAV1] __data.json OK: ${servers.length} servidores soportados`);
                return servers;
            }
            throw Error("__data.json returned 0 servidores soportados, falling back");
        }
        catch (e) {
            console.warn(`[AnimeAV1] __data.json falló (${e.message}), probando HTML scraping`);
        }
        // ── Método de respaldo: scraping HTML ──────────────────────────────────
        try {
            const html = yield fetch(pageUrl, { headers: { "User-Agent": UA } }).then((resp) => {
                if (!resp.ok)
                    throw Error(`HTTP error! Status: ${resp.status}`);
                return resp.text();
            });
            // Antes se usaba cheerio para localizar el <script> con kit.start(...);
            // como solo hace falta encontrar ESE bloque de texto dentro del HTML
            // completo (no navegar el DOM), una regex simple lo aísla igual de bien.
            const metadataJSON = (_e = html.match(/kit\.start\(app,\s*element,\s*\{[\s\S]*/)) === null || _e === void 0 ? void 0 : _e[0];
            const serversObj = (_f = metadataJSON === null || metadataJSON === void 0 ? void 0 : metadataJSON.match(/embeds:\s?.*?SUB:\s?(\[.*?\])/)) === null || _f === void 0 ? void 0 : _f[1];
            const serversObjDUB = (_g = metadataJSON === null || metadataJSON === void 0 ? void 0 : metadataJSON.match(/embeds:\s?.*?DUB:\s?(\[.*?\])/)) === null || _g === void 0 ? void 0 : _g[1];
            const downloadObj = (_h = metadataJSON === null || metadataJSON === void 0 ? void 0 : metadataJSON.match(/downloads:\s?.*?SUB:\s?(\[.*?\])/)) === null || _h === void 0 ? void 0 : _h[1];
            const downloadObjDUB = (_j = metadataJSON === null || metadataJSON === void 0 ? void 0 : metadataJSON.match(/downloads:\s?.*?DUB:\s?(\[.*?\])/)) === null || _j === void 0 ? void 0 : _j[1];
            let raw = [];
            if (serversObj)
                raw = raw.concat(serversObj.split("},").map(s => { var _a, _b; return ({ title: (_a = s.match(/server:\s?"(.*?)"/)) === null || _a === void 0 ? void 0 : _a[1], code: (_b = s.match(/url:\s?"(.*?)"/)) === null || _b === void 0 ? void 0 : _b[1], dub: false }); }));
            if (downloadObj)
                raw = raw.concat(downloadObj.split("},").map(s => { var _a, _b; return ({ title: (_a = s.match(/server:\s?"(.*?)"/)) === null || _a === void 0 ? void 0 : _a[1], code: (_b = s.match(/url:\s?"(.*?)"/)) === null || _b === void 0 ? void 0 : _b[1], dub: false }); }));
            if (serversObjDUB)
                raw = raw.concat(serversObjDUB.split("},").map(s => { var _a, _b; return ({ title: (_a = s.match(/server:\s?"(.*?)"/)) === null || _a === void 0 ? void 0 : _a[1], code: (_b = s.match(/url:\s?"(.*?)"/)) === null || _b === void 0 ? void 0 : _b[1], dub: true }); }));
            if (downloadObjDUB)
                raw = raw.concat(downloadObjDUB.split("},").map(s => { var _a, _b; return ({ title: (_a = s.match(/server:\s?"(.*?)"/)) === null || _a === void 0 ? void 0 : _a[1], code: (_b = s.match(/url:\s?"(.*?)"/)) === null || _b === void 0 ? void 0 : _b[1], dub: true }); }));
            const servers = raw
                .filter(s => s.title && Object.keys(SOURCE_EXTRACTORS).some((key) => s.title.includes(key)) && s.code)
                .map(s => ({ name: s.title, url: s.code, dub: s.dub }));
            console.log(`[AnimeAV1] HTML scraping OK: ${servers.length} servidores soportados`);
            return servers;
        }
        catch (e) {
            console.error("[AnimeAV1] Error en fallback HTML:", e.message);
            return [];
        }
    });
}
/**
 * HLS/zilla-networks.
 * Confirmado funcionando en producción (móvil y TV) gracias a los headers
 * Sec-Fetch-Site/Mode/Dest, que Cloudflare exige en cada segmento del manifest
 * para no responder 403 (con solo Referer + User-Agent los segmentos fallaban).
 */
function isUsableHttpStreamUrlLocal(value) {
    if (typeof value !== 'string')
        return false;
    const candidate = value.trim();
    if (!/^https?:\/\//i.test(candidate))
        return false;
    try {
        const parsed = new URL(candidate);
        if (!parsed.hostname || parsed.hostname === 'localhost')
            return false;
        // Zilla sin el identificador del manifiesto produce una URL sintácticamente
        // válida, pero vacía: https://player.zilla-networks.com/m3u8/.
        if (/\/m3u8\/?$/i.test(parsed.pathname))
            return false;
        return true;
    }
    catch (_) {
        return false;
    }
}
function extractZillaHLS(playUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isUsableHttpStreamUrlLocal(playUrl))
            throw Error('URL de HLS vacía o inválida');
        const directUrl = playUrl.replace('/play/', '/m3u8/');
        if (!isUsableHttpStreamUrlLocal(directUrl))
            throw Error('URL de HLS sin identificador de reproducción');
        console.log(`[HLS-zilla] URL construida: ${directUrl}`);
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
        };
    });
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
const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];
function voeRot13(str) {
    return str.replace(/[a-zA-Z]/g, (char) => {
        const code = char.charCodeAt(0);
        const base = code <= 90 ? 65 : 97;
        return String.fromCharCode((code - base + 13) % 26 + base);
    });
}
function voeReplaceMarkers(str) {
    let out = str;
    for (const marker of VOE_MARKERS) {
        out = out.split(marker).join('_');
    }
    return out;
}
function decodeVoePayload(rawValue) {
    let x = voeRot13(rawValue);
    x = voeReplaceMarkers(x);
    x = x.split('_').join('');
    x = atob(x);
    x = Array.from(x).map((c) => String.fromCharCode((c.charCodeAt(0) - 3 + 256) % 256)).join('');
    x = x.split('').reverse().join('');
    x = atob(x);
    return JSON.parse(x);
}
// extractVoe devuelve únicamente el manifest HLS reproducible de Voe.
function extractVoe(embedUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        // El fetch sigue la redirección HTTP normal, pero VOE también puede
        // devolver una página intermedia que redirige mediante JavaScript.
        let resp = yield fetch(embedUrl, {
            headers: { "User-Agent": UA }
        });
        if (!resp.ok)
            throw Error(`HTTP error! Status: ${resp.status}`);
        let html = yield resp.text();
        // fetch() no ejecuta JavaScript, así que seguimos manualmente la redirección
        // window.location.href que usa VOE.
        const jsRedirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (jsRedirect) {
            const redirectUrl = jsRedirect[1];
            console.log(`[Voe] Redirección JS detectada: ${redirectUrl}`);
            resp = yield fetch(redirectUrl, {
                headers: { "User-Agent": UA }
            });
            if (!resp.ok)
                throw Error(`HTTP error! Status: ${resp.status}`);
            html = yield resp.text();
        }
        const scriptMatch = html.match(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
        if (!scriptMatch)
            throw Error("No se encontró el <script type=\"application/json\"> en el embed de Voe");
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
            .replace(/&gt;/g, '>');
        let payloadArray;
        try {
            payloadArray = JSON.parse(jsonText);
        }
        catch (e) {
            throw Error(`No se pudo parsear el array JSON del embed de Voe: ${e.message}`);
        }
        if (!Array.isArray(payloadArray) || !payloadArray[0]) {
            throw Error("El embed de Voe no trajo el payload esperado");
        }
        let decoded;
        try {
            decoded = decodeVoePayload(payloadArray[0]);
        }
        catch (e) {
            throw Error(`No se pudo decodificar el payload de Voe: ${e.message}`);
        }
        const voeOrigin = (() => { try {
            return new URL(embedUrl).origin;
        }
        catch (_) {
            return undefined;
        } })();
        // Mismos headers Sec-Fetch-* que confirmamos necesarios para zilla-networks
        // (Cloudflare/CDNs similares suelen exigirlos en los segmentos del manifest).
        const hlsHeaders = {
            "Referer": voeOrigin ? `${voeOrigin}/` : embedUrl,
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            "User-Agent": UA
        };
        const sourceUrl = typeof decoded.source === 'string' ? decoded.source.trim() : '';
        if (!isUsableHttpStreamUrlLocal(sourceUrl))
            throw Error("El payload de Voe no trajo una URL HLS válida");
        console.log(`[Voe] HLS extraído: ${sourceUrl}`);
        return {
            url: sourceUrl,
            headers: hlsHeaders,
            type: "hls"
        };
    });
}
// Registro de sources activos: únicamente HLS directo de Zilla y HLS de Voe.
const ALL_SOURCES = {
    HLS: { label: "HLS", extract: extractZillaHLS },
    Voe: { label: "Voe HLS", extract: extractVoe }
};
for (const [key, source] of Object.entries(ALL_SOURCES)) {
    if (ENABLED_SOURCES[key])
        SOURCE_EXTRACTORS[key] = source;
}
// ─────────────────────────────────────────────
// Entry point — contrato Nuvio
// ─────────────────────────────────────────────
const getLangLabel = (dub) => dub ? "🇲🇽 LATINO" : "🇯🇵 JAPONÉS · 🇲🇽 Sub";
/**
 * @param {string|number} tmdbId
 * @param {string} type - "movie" | "tv"
 * @param {string|number} [season]
 * @param {string|number} [episode]
 * @returns {Promise<Array>}
 */
function resolveAnimeAV1LocalLegacy(tmdbId, type, season, episode) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!tmdbId || !type)
            return [];
        console.log(`[AnimeAV1] Buscando: TMDB ${tmdbId} (${type}) S${season !== null && season !== void 0 ? season : '-'}E${episode !== null && episode !== void 0 ? episode : '-'}`);
        try {
            // seasonNum no depende de ningún fetch — se calcula primero para poder
            // disparar getTMDBInfo y getSeasonYear en paralelo (antes se esperaba
            // getTMDBInfo completo antes de siquiera empezar getSeasonYear, aunque
            // ninguno depende del resultado del otro).
            const seasonNum = type === "movie" ? 1 : (season ? Number(season) : 1);
            const [info, tmdbSeasonYear] = yield Promise.all([
                getTMDBInfo(tmdbId, type),
                // Para películas no existe temporada en TMDB — evitamos la llamada de más.
                type === "movie" ? Promise.resolve(undefined) : getSeasonYear(tmdbId, seasonNum)
            ]);
            if (!info)
                return [];
            if (!looksLikeAnime(info)) {
                const reason = !looksLikeAsianOrigin(info.originCountries)
                    ? `origen no asiático (${info.originCountries.join(', ') || 'desconocido'})`
                    : `sin género Animation`;
                console.log(`[AnimeAV1] Descartado (${reason}), omitiendo búsqueda: "${info.title}"`);
                return [];
            }
            // Matching 1.1.2: título por palabras + temporada + año de búsqueda.
            // TMDB aporta el año de la temporada; si el resultado es ambiguo, AniList
            // aporta el título romaji y vuelve a ejecutarse el matching.
            let seasonYear = type === "movie" ? info.year : tmdbSeasonYear;
            let searchTerm = seasonNum !== 1 ? `${info.title} ${seasonNum}` : info.title;
            if (seasonYear === undefined && type !== "movie") {
                console.warn(`[AnimeAV1] TMDB sin año para temporada ${seasonNum}, probando AniList`);
                const aniListInfo = yield getAniListInfo(info.title, seasonNum);
                if (aniListInfo) {
                    seasonYear = aniListInfo.year;
                    searchTerm = aniListInfo.romajiTitle;
                }
            }
            console.log(`[AnimeAV1] searchTerm="${searchTerm}" year=${seasonYear !== null && seasonYear !== void 0 ? seasonYear : 'ninguno'}`);
            let candidates = yield searchAnimeAV1(searchTerm, seasonYear, seasonNum);
            let matchInfo = pickBestMatch(candidates, searchTerm, seasonNum);
            // Si el primer intento no alcanza el umbral, usamos AniList como segunda
            // estrategia aunque TMDB sí haya proporcionado un año. Esto evita volver
            // silenciosamente al primer resultado cuando el título de TMDB y el
            // catálogo romaji de AnimeAV1 no coinciden bien.
            if (!(matchInfo === null || matchInfo === void 0 ? void 0 : matchInfo.accepted) && type !== "movie") {
                console.warn(`[AnimeAV1] Matching ambiguo para "${searchTerm}"; probando título romaji de AniList`);
                const aniListInfo = yield getAniListInfo(info.title, seasonNum);
                if (aniListInfo && (aniListInfo.romajiTitle !== searchTerm || aniListInfo.year !== seasonYear)) {
                    const retryYear = (_a = aniListInfo.year) !== null && _a !== void 0 ? _a : seasonYear;
                    const retryTerm = aniListInfo.romajiTitle;
                    try {
                        candidates = yield searchAnimeAV1(retryTerm, retryYear, seasonNum);
                        const retryMatch = pickBestMatch(candidates, retryTerm, seasonNum);
                        if ((retryMatch === null || retryMatch === void 0 ? void 0 : retryMatch.accepted) || !(matchInfo === null || matchInfo === void 0 ? void 0 : matchInfo.accepted)) {
                            matchInfo = retryMatch;
                            seasonYear = retryYear;
                            searchTerm = retryTerm;
                        }
                    }
                    catch (e) {
                        console.warn(`[AnimeAV1] Segunda búsqueda AniList falló: ${e.message}`);
                    }
                }
            }
            if (!(matchInfo === null || matchInfo === void 0 ? void 0 : matchInfo.accepted)) {
                console.warn(`[AnimeAV1] No hay una coincidencia suficientemente segura para "${searchTerm}"; no se usará el primer resultado`);
                return [];
            }
            const match = matchInfo.candidate;
            console.log(`[AnimeAV1] Match elegido: "${match.title}" (${match.slug}) score=${matchInfo.score.toFixed(1)}`);
            const epNumber = type === "movie" ? 1 : (episode !== undefined ? Number(episode) : 1);
            let servers = yield getEpisodeServers(match.slug, epNumber);
            // Fallback película: algunas están indexadas como episodio 0
            if (servers.length === 0 && type === "movie" && epNumber === 1) {
                console.warn(`[AnimeAV1] Reintentando película con episodio 0`);
                servers = yield getEpisodeServers(match.slug, 0);
            }
            if (servers.length === 0) {
                console.warn(`[AnimeAV1] Sin servidores soportados para "${match.title}"`);
                return [];
            }
            // Orden de salida: primero HLS Zilla y luego Voe HLS; dentro de cada source,
            // SUB (japonés) antes que DUB (latino).
            const sourceOrder = Object.keys(SOURCE_EXTRACTORS);
            servers = [...servers].sort((a, b) => {
                const aIdx = sourceOrder.findIndex((key) => a.name.includes(key));
                const bIdx = sourceOrder.findIndex((key) => b.name.includes(key));
                if (aIdx !== bIdx)
                    return aIdx - bIdx;
                return (a.dub ? 1 : 0) - (b.dub ? 1 : 0); // false (SUB) antes que true (DUB)
            });
            const results = yield Promise.all(servers.map((server) => __awaiter(this, void 0, void 0, function* () {
                const sourceKey = Object.keys(SOURCE_EXTRACTORS).find((key) => server.name.includes(key));
                const source = sourceKey ? SOURCE_EXTRACTORS[sourceKey] : null;
                if (!source)
                    return null;
                try {
                    const resolved = yield source.extract(server.url);
                    // Los extractores devuelven un objeto HLS reproducible; se normaliza a array
                    // para mantener el flujo común de procesamiento.
                    const variantsList = Array.isArray(resolved) ? resolved : [resolved];
                    return variantsList.map((variant) => {
                        const sourceLabel = sourceKey === 'Voe' ? 'Voe 720p' : source.label;
                        const resolution = sourceKey === 'Voe' ? '720p' : '1080p';
                        const label = `📺 ${sourceLabel}\n${resolution} | WEB-DL | Anime\n${getLangLabel(server.dub)}`;
                        return Object.assign({ name: `AnimeAV1`, title: "", url: variant.url, quality: label, headers: variant.headers }, (variant.type ? { type: variant.type } : {}));
                    });
                }
                catch (e) {
                    console.warn(`[${source.label}] Falló resolviendo un servidor: ${e.message}`);
                    return null;
                }
            })));
            const final = results.filter(Boolean).flat();
            const unique = [...new Map(final.map((stream) => [`${stream.url}|${stream.quality}`, stream])).values()];
            console.log(`[AnimeAV1] ✓ ${unique.length} streams devueltos`);
            return unique;
        }
        catch (e) {
            console.error(`[AnimeAV1] Error: ${e.message}`);
            return [];
        }
    });
}
// ─────────────────────────────────────────────
// Resolver remoto principal + resolución local completa de respaldo (1.2.9)
// ─────────────────────────────────────────────
const ANIMEAV1_RESOLVER_URL = "https://animeav1-resolver.onrender.com";
const RESOLVER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LOCAL_RESOLVER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RESOLVER_CACHE_MAX_ENTRIES = 500;
const RESOLVER_TIMEOUT_MS = 12000;
const animeAV1RemoteCache = new Map();
const animeAV1LocalCache = new Map();
function maintainResolverCache(cache, ttlMs, now = Date.now()) {
    for (const [key, entry] of cache) {
        if (!(entry === null || entry === void 0 ? void 0 : entry.timestamp) || now - entry.timestamp >= ttlMs)
            cache.delete(key);
    }
    while (cache.size >= RESOLVER_CACHE_MAX_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey === undefined)
            break;
        cache.delete(oldestKey);
    }
}
function fetchWithTimeoutLocal(url_1) {
    return __awaiter(this, arguments, void 0, function* (url, timeoutMs = RESOLVER_TIMEOUT_MS) {
        let controller;
        try {
            if (typeof AbortController !== 'undefined')
                controller = new AbortController();
        }
        catch (_) { }
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
                try {
                    controller === null || controller === void 0 ? void 0 : controller.abort();
                }
                catch (_) { }
                reject(Error(`Timeout de ${timeoutMs} ms`));
            }, timeoutMs);
        });
        try {
            const request = fetch(url, controller ? { signal: controller.signal } : undefined);
            return yield Promise.race([request, timeout]);
        }
        finally {
            clearTimeout(timer);
        }
    });
}
function resolverCacheKey(tmdbId, type, seasonNum) {
    return `${tmdbId}|${type}|${seasonNum}`;
}
function getRemoteAnimeIdentity(tmdbId, type, seasonNum) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const key = resolverCacheKey(tmdbId, type, seasonNum);
        const cached = animeAV1RemoteCache.get(key);
        if (cached && Date.now() - cached.timestamp < RESOLVER_CACHE_TTL_MS) {
            animeAV1RemoteCache.delete(key);
            animeAV1RemoteCache.set(key, cached);
            console.log(`[AnimeAV1] Caché del resolver remoto: ${cached.slug}`);
            return cached;
        }
        if (cached)
            animeAV1RemoteCache.delete(key);
        const url = `${ANIMEAV1_RESOLVER_URL}/resolve?tmdbId=${encodeURIComponent(tmdbId)}&type=${encodeURIComponent(type)}&season=${encodeURIComponent(seasonNum)}`;
        console.log(`[AnimeAV1] Resolver remoto: ${url}`);
        const response = yield fetchWithTimeoutLocal(url);
        if (!response.ok)
            throw Error(`Resolver remoto HTTP ${response.status}`);
        const data = yield response.json();
        if (!data || data.success !== true || typeof data.slug !== 'string' || !data.slug.trim()) {
            throw Error((data === null || data === void 0 ? void 0 : data.error) || 'El resolver remoto no devolvió un slug válido');
        }
        const identity = {
            slug: data.slug.trim(),
            title: data.animeav1Title || '',
            score: typeof data.score === 'number' ? data.score : undefined,
            matchType: data.matchType || 'remote',
            timestamp: Date.now()
        };
        maintainResolverCache(animeAV1RemoteCache, RESOLVER_CACHE_TTL_MS);
        animeAV1RemoteCache.set(key, identity);
        console.log(`[AnimeAV1] Resolver remoto encontró "${identity.title || identity.slug}" slug=${identity.slug} score=${(_a = identity.score) !== null && _a !== void 0 ? _a : '?'} tipo=${identity.matchType}`);
        return identity;
    });
}
function getTMDBSeasonInfoLocal(tmdbId, seasonNum) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=en-US`;
            const response = yield fetch(url, { headers: { 'User-Agent': UA } });
            if (!response.ok)
                throw Error(`HTTP ${response.status}`);
            const data = yield response.json();
            const airDate = (data === null || data === void 0 ? void 0 : data.air_date) || '';
            return {
                year: airDate ? new Date(airDate).getFullYear() : undefined,
                name: (data === null || data === void 0 ? void 0 : data.name) || (data === null || data === void 0 ? void 0 : data.original_name) || '',
                airDate
            };
        }
        catch (e) {
            console.warn(`[TMDB] Datos de temporada no disponibles para S${seasonNum}: ${e.message}`);
            return { year: undefined, name: '', airDate: '' };
        }
    });
}
function getTMDBAlternativeTitlesLocal(tmdbId, type) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const path = type === 'movie' ? 'movie' : 'tv';
            const url = `https://api.themoviedb.org/3/${path}/${tmdbId}/alternative_titles?api_key=${TMDB_API_KEY}`;
            const response = yield fetch(url, { headers: { 'User-Agent': UA } });
            if (!response.ok)
                throw Error(`HTTP ${response.status}`);
            const data = yield response.json();
            const rows = type === 'movie' ? data === null || data === void 0 ? void 0 : data.titles : data === null || data === void 0 ? void 0 : data.results;
            if (!Array.isArray(rows))
                return [];
            const countries = new Set(['US', 'JP', 'KR', 'CN', 'TW', 'HK']);
            return uniqueLocalTitles(rows
                .filter((row) => row && typeof row.title === 'string' && row.title.trim().length >= 3 && (!row.iso_3166_1 || countries.has(row.iso_3166_1)))
                .map((row) => row.title), 8);
        }
        catch (e) {
            console.warn(`[TMDB] Títulos alternativos no disponibles: ${e.message}`);
            return [];
        }
    });
}
function uniqueLocalTitles(values, maxCount = 20) {
    const result = [];
    const seen = new Set();
    for (const value of values || []) {
        const raw = String(value || '').trim();
        const key = normalizeTitle(raw);
        if (!key || key.length < 3 || seen.has(key))
            continue;
        if (/^(?:season\s*\d+|\d+(?:st|nd|rd|th)?\s+season|part\s*\d+)$/.test(key))
            continue;
        seen.add(key);
        result.push(raw);
        if (result.length >= maxCount)
            break;
    }
    return result;
}
function fetchAniListCandidatesLocal(title) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
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
  }`;
        const response = yield fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables: { search: title } })
        });
        if (!response.ok)
            throw Error(`AniList HTTP ${response.status}`);
        const json = yield response.json();
        if (Array.isArray(json === null || json === void 0 ? void 0 : json.errors) && json.errors.length)
            throw Error(`AniList GraphQL: ${((_a = json.errors[0]) === null || _a === void 0 ? void 0 : _a.message) || 'error desconocido'}`);
        const rows = (_c = (_b = json === null || json === void 0 ? void 0 : json.data) === null || _b === void 0 ? void 0 : _b.Page) === null || _c === void 0 ? void 0 : _c.media;
        return Array.isArray(rows) ? rows : [];
    });
}
function ordinalSeasonLabelLocal(seasonNum) {
    const n = Math.max(1, Number(seasonNum) || 1);
    const mod100 = n % 100;
    const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
    return `${n}${suffix} Season`;
}
function explicitSeasonForMediaLocal(media, targetSeason) {
    const title = (media === null || media === void 0 ? void 0 : media.title) || {};
    const values = [title.romaji, title.english, title.native, ...(Array.isArray(media === null || media === void 0 ? void 0 : media.synonyms) ? media.synonyms : [])];
    const seasons = values.map(getExplicitSeason).filter(Number.isInteger);
    if (targetSeason > 1 && seasons.includes(targetSeason))
        return targetSeason;
    return seasons[0];
}
function uniqueTitleRecordsLocal(values, maxCount = 20) {
    const result = [];
    const seen = new Map();
    for (const item of values || []) {
        const term = String(typeof item === 'string' ? item : (item === null || item === void 0 ? void 0 : item.term) || '').trim();
        const origin = typeof item === 'string' ? 'tmdb' : ((item === null || item === void 0 ? void 0 : item.origin) || 'tmdb');
        const key = normalizeTitle(term);
        if (!key || key.length < 3)
            continue;
        if (/^(?:season\s*\d+|\d+(?:st|nd|rd|th)?\s+season|part\s*\d+)$/.test(key))
            continue;
        if (seen.has(key)) {
            const index = seen.get(key);
            if ((item === null || item === void 0 ? void 0 : item.seasonIdentity) && !result[index].seasonIdentity) {
                result[index] = Object.assign(Object.assign({}, result[index]), { seasonIdentity: true, targetSeason: item.targetSeason });
            }
            continue;
        }
        seen.set(key, result.length);
        result.push(Object.assign({ term, origin }, ((item === null || item === void 0 ? void 0 : item.seasonIdentity) ? { seasonIdentity: true, targetSeason: item.targetSeason } : {})));
        if (result.length >= maxCount)
            break;
    }
    return result;
}
function scoreAniListCandidateLocal(media, sourceTitles, baseTitles, targetYear, seasonNum) {
    var _a;
    const title = (media === null || media === void 0 ? void 0 : media.title) || {};
    const named = [
        { value: title.romaji || '', synonym: false },
        { value: title.english || '', synonym: false },
        { value: title.native || '', synonym: false },
        ...(Array.isArray(media === null || media === void 0 ? void 0 : media.synonyms) ? media.synonyms.map((value) => ({ value: value || '', synonym: true })) : [])
    ];
    let titleScore = 0;
    let matchType = 'title-similarity';
    for (const sourceTitle of sourceTitles) {
        const target = normalizeTitle(sourceTitle);
        if (!target)
            continue;
        const targetTokens = new Set(titleTokens(sourceTitle));
        for (const name of named) {
            const candidate = normalizeTitle(name.value);
            if (!candidate)
                continue;
            let score = 0;
            if (candidate === target)
                score = name.synonym ? 130 : 120;
            else if (target.length >= 5 && candidate.length >= 5 && (candidate.includes(target) || target.includes(candidate))) {
                score = 82 + (Math.min(target.length, candidate.length) / Math.max(target.length, candidate.length)) * 12;
            }
            else {
                const candidateTokens = new Set(titleTokens(name.value));
                if (!targetTokens.size || !candidateTokens.size)
                    continue;
                let overlap = 0;
                targetTokens.forEach((token) => { if (candidateTokens.has(token))
                    overlap++; });
                const coverage = overlap / targetTokens.size;
                const precision = overlap / candidateTokens.size;
                const symmetric = overlap ? 2 * overlap / (targetTokens.size + candidateTokens.size) : 0;
                score = Math.max(coverage * 58 + precision * 12, symmetric * 78);
            }
            if (score > titleScore) {
                titleScore = score;
                matchType = name.synonym && score >= 120 ? 'anilist-synonym' : (score >= 120 ? 'anilist-title' : 'title-similarity');
            }
        }
    }
    const year = Number((media === null || media === void 0 ? void 0 : media.seasonYear) || ((_a = media === null || media === void 0 ? void 0 : media.startDate) === null || _a === void 0 ? void 0 : _a.year)) || undefined;
    let yearBonus = 0;
    if (targetYear && year) {
        const diff = Math.abs(year - targetYear);
        if (diff === 0)
            yearBonus = 36;
        else if (diff === 1)
            yearBonus = 12;
        else if (diff === 2)
            yearBonus = 2;
        else
            yearBonus = -Math.min(45, (diff - 2) * 8);
    }
    const explicitSeason = explicitSeasonForMediaLocal(media, seasonNum);
    const baseSimilarity = Math.max(0, ...baseTitles.map((sourceTitle) => Math.max(0, ...named.map((name) => wordSimilarity(sourceTitle, name.value)))));
    let seasonBonus = 0;
    if (seasonNum > 1) {
        if (explicitSeason === seasonNum)
            seasonBonus = 220;
        else if (explicitSeason !== undefined)
            seasonBonus = -220;
        if ((media === null || media === void 0 ? void 0 : media.format) && media.format !== 'TV')
            seasonBonus -= 100;
    }
    return { media, year, titleScore, score: titleScore + yearBonus + seasonBonus + baseSimilarity * 30, matchType, explicitSeason, baseSimilarity };
}
function fetchAniListMediaRelationsLocal(mediaId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const query = `query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      relations {
        edges {
          relationType
          node {
            id
            idMal
            type
            format
            title { romaji english native }
            synonyms
            seasonYear
            startDate { year month day }
          }
        }
      }
    }
  }`;
        const response = yield fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables: { id: Number(mediaId) } })
        });
        if (!response.ok)
            throw Error(`AniList relaciones HTTP ${response.status}`);
        const json = yield response.json();
        if (Array.isArray(json === null || json === void 0 ? void 0 : json.errors) && json.errors.length)
            throw Error(`AniList GraphQL: ${((_a = json.errors[0]) === null || _a === void 0 ? void 0 : _a.message) || 'error desconocido'}`);
        return ((_b = json === null || json === void 0 ? void 0 : json.data) === null || _b === void 0 ? void 0 : _b.Media) || undefined;
    });
}
function mediaMatchesBaseSeriesLocal(media, baseTitles) {
    const title = (media === null || media === void 0 ? void 0 : media.title) || {};
    const names = [title.romaji, title.english, title.native, ...((media === null || media === void 0 ? void 0 : media.synonyms) || [])].filter(Boolean);
    const normalizedBases = new Set(baseTitles.map(normalizeTitle).filter(Boolean));
    if (names.some((name) => normalizedBases.has(normalizeTitle(name))))
        return true;
    return names.some((name) => baseTitles.some((base) => wordSimilarity(base, name) >= 0.95 && wordSimilarity(name, base) >= 0.75));
}
function verifyAniListSeasonViaRelationsLocal(mediaId_1, expectedSeason_1, baseTitles_1) {
    return __awaiter(this, arguments, void 0, function* (mediaId, expectedSeason, baseTitles, visited = new Set(), depth = 0) {
        var _a;
        if (!mediaId || expectedSeason < 2 || depth > 8 || visited.has(Number(mediaId)))
            return false;
        visited.add(Number(mediaId));
        const media = yield fetchAniListMediaRelationsLocal(mediaId);
        const edges = (_a = media === null || media === void 0 ? void 0 : media.relations) === null || _a === void 0 ? void 0 : _a.edges;
        if (!Array.isArray(edges))
            return false;
        const tvPrequels = edges
            .filter((edge) => { var _a, _b; return (edge === null || edge === void 0 ? void 0 : edge.relationType) === 'PREQUEL' && ((_a = edge === null || edge === void 0 ? void 0 : edge.node) === null || _a === void 0 ? void 0 : _a.type) === 'ANIME' && ((_b = edge === null || edge === void 0 ? void 0 : edge.node) === null || _b === void 0 ? void 0 : _b.format) === 'TV'; })
            .map((edge) => edge.node);
        for (const prequel of tvPrequels) {
            if (expectedSeason === 2 && mediaMatchesBaseSeriesLocal(prequel, baseTitles))
                return true;
            const previousSeason = explicitSeasonForMediaLocal(prequel, expectedSeason - 1);
            if (previousSeason === expectedSeason - 1)
                return true;
            if (previousSeason !== undefined)
                continue;
            if (expectedSeason > 2 && prequel.id && (yield verifyAniListSeasonViaRelationsLocal(prequel.id, expectedSeason - 1, baseTitles, new Set(visited), depth + 1)))
                return true;
        }
        return false;
    });
}
function resolveAniListIdentityLocal(info_1, seasonNum_1, targetYear_1) {
    return __awaiter(this, arguments, void 0, function* (info, seasonNum, targetYear, extraTitles = []) {
        const baseTitles = uniqueLocalTitles([info === null || info === void 0 ? void 0 : info.title, info === null || info === void 0 ? void 0 : info.originalTitle], 4);
        const specificExtras = uniqueLocalTitles((extraTitles || []).filter((value) => getExplicitSeason(value) === seasonNum), 3);
        const ordinalQueries = seasonNum > 1
            ? uniqueLocalTitles([
                ...specificExtras,
                ...((info === null || info === void 0 ? void 0 : info.title) ? [`${info.title} ${ordinalSeasonLabelLocal(seasonNum)}`] : []),
                ...((info === null || info === void 0 ? void 0 : info.originalTitle) ? [`${info.originalTitle} ${ordinalSeasonLabelLocal(seasonNum)}`] : [])
            ], 3)
            : uniqueLocalTitles([...baseTitles, ...(extraTitles || [])], 3);
        if (!ordinalQueries.length && !baseTitles.length)
            return undefined;
        const all = [];
        const seenIds = new Set();
        const rejectedRelationIds = new Set();
        const relationVerificationCache = new Map();
        const verifyCandidateRelations = (entry) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const id = Number((_a = entry === null || entry === void 0 ? void 0 : entry.media) === null || _a === void 0 ? void 0 : _a.id);
            if (!id)
                return false;
            if (relationVerificationCache.has(id))
                return relationVerificationCache.get(id);
            try {
                const verified = yield verifyAniListSeasonViaRelationsLocal(id, seasonNum, baseTitles);
                relationVerificationCache.set(id, verified);
                if (!verified)
                    rejectedRelationIds.add(id);
                return verified;
            }
            catch (error) {
                console.warn(`[AniList] No se pudo validar relación del candidato ${id}: ${error.message}`);
                relationVerificationCache.set(id, false);
                rejectedRelationIds.add(id);
                return false;
            }
        });
        const fetchOne = (query) => __awaiter(this, void 0, void 0, function* () {
            let rows = [];
            try {
                rows = yield fetchAniListCandidatesLocal(query);
            }
            catch (error) {
                console.warn(`[AniList] Búsqueda local "${query}" falló: ${error.message}`);
            }
            for (const row of rows) {
                if ((row === null || row === void 0 ? void 0 : row.id) == null || seenIds.has(row.id))
                    continue;
                seenIds.add(row.id);
                all.push(row);
            }
        });
        const rankResults = () => {
            var _a;
            const identityTitles = uniqueLocalTitles([info === null || info === void 0 ? void 0 : info.title, info === null || info === void 0 ? void 0 : info.originalTitle, ...(extraTitles || [])], 12);
            const scored = all.map((media) => scoreAniListCandidateLocal(media, identityTitles, baseTitles, targetYear, seasonNum));
            if (seasonNum <= 1) {
                const baseMatches = scored.filter((entry) => entry.explicitSeason === undefined || entry.explicitSeason === 1)
                    .sort((a, b) => b.score - a.score || b.titleScore - a.titleScore);
                return ((_a = baseMatches[0]) === null || _a === void 0 ? void 0 : _a.titleScore) >= 52 ? baseMatches[0] : undefined;
            }
            const explicitMatches = scored.filter((entry) => { var _a; return entry.explicitSeason === seasonNum && entry.baseSimilarity >= 0.45 && (!((_a = entry.media) === null || _a === void 0 ? void 0 : _a.format) || entry.media.format === 'TV'); });
            if (explicitMatches.length) {
                explicitMatches.sort((a, b) => b.score - a.score || b.titleScore - a.titleScore);
                return Object.assign(Object.assign({}, explicitMatches[0]), { seasonProof: 'explicit-title' });
            }
            const baseNormalizedTitles = new Set([info === null || info === void 0 ? void 0 : info.title, info === null || info === void 0 ? void 0 : info.originalTitle].map(normalizeTitle).filter(Boolean));
            const yearMatches = scored.filter((entry) => {
                var _a, _b, _c;
                if (rejectedRelationIds.has(Number((_a = entry.media) === null || _a === void 0 ? void 0 : _a.id)))
                    return false;
                const mediaTitle = ((_b = entry.media) === null || _b === void 0 ? void 0 : _b.title) || {};
                const primary = normalizeTitle(mediaTitle.romaji || mediaTitle.english || '');
                const hasTargetYear = targetYear ? entry.year === targetYear : Boolean(entry.year);
                const distinctTitle = primary && !baseNormalizedTitles.has(primary);
                return hasTargetYear && distinctTitle && entry.baseSimilarity >= 0.7 && entry.explicitSeason === undefined && (!((_c = entry.media) === null || _c === void 0 ? void 0 : _c.format) || entry.media.format === 'TV');
            });
            if (yearMatches.length) {
                yearMatches.sort((a, b) => b.score - a.score || b.titleScore - a.titleScore);
                return Object.assign(Object.assign({}, yearMatches[0]), { seasonProof: 'year-needs-relations' });
            }
            return undefined;
        };
        let selected;
        // Query targeted season titles sequentially; stop when an explicit season or
        // a title/year candidate whose PREQUEL chain proves this season is found.
        for (const query of ordinalQueries) {
            yield fetchOne(query);
            selected = rankResults();
            if ((selected === null || selected === void 0 ? void 0 : selected.seasonProof) === 'explicit-title')
                break;
            if ((selected === null || selected === void 0 ? void 0 : selected.seasonProof) === 'year-needs-relations') {
                if (yield verifyCandidateRelations(selected))
                    break;
                selected = rankResults();
            }
        }
        // Only broaden to the base franchise title if targeted searches didn't yield
        // a plausible seasonal identity; cap extra requests at two queries.
        if (!selected && seasonNum > 1) {
            const fallbackQueries = baseTitles.filter((title) => !ordinalQueries.some((query) => normalizeTitle(query) === normalizeTitle(title)));
            for (const query of fallbackQueries.slice(0, 2)) {
                yield fetchOne(query);
                selected = rankResults();
                if ((selected === null || selected === void 0 ? void 0 : selected.seasonProof) === 'explicit-title')
                    break;
                if ((selected === null || selected === void 0 ? void 0 : selected.seasonProof) === 'year-needs-relations') {
                    if (yield verifyCandidateRelations(selected))
                        break;
                    selected = rankResults();
                }
            }
        }
        if (!selected) {
            console.warn(`[AniList] No se identificó con confianza la temporada ${seasonNum} de "${info.title}"`);
            return undefined;
        }
        const media = selected.media;
        const title = (media === null || media === void 0 ? void 0 : media.title) || {};
        let seasonVerified = seasonNum === 1 || selected.explicitSeason === seasonNum;
        if (!seasonVerified && seasonNum > 1 && selected.seasonProof === 'year-needs-relations')
            seasonVerified = yield verifyCandidateRelations(selected);
        console.log(`[AniList] Resolver local: "${title.romaji || title.english || '?'}" id=${media.id} year=${selected.year || targetYear || '?'} score=${selected.score.toFixed(1)} seasonVerified=${Boolean(seasonVerified)} proof=${selected.seasonProof || 'legacy'} match=${selected.matchType}`);
        return {
            year: selected.year || targetYear,
            romajiTitle: title.romaji || '',
            englishTitle: title.english || '',
            nativeTitle: title.native || '',
            synonyms: Array.isArray(media === null || media === void 0 ? void 0 : media.synonyms) ? media.synonyms : [],
            matchType: selected.matchType,
            score: selected.score,
            anilistId: media.id,
            explicitSeason: selected.explicitSeason,
            seasonVerified: Boolean(seasonVerified),
            seasonNum
        };
    });
}
function extractAnimeAV1StreamsLocal(servers) {
    return __awaiter(this, void 0, void 0, function* () {
        const sourceOrder = Object.keys(SOURCE_EXTRACTORS);
        const supported = servers.filter((server) => sourceOrder.some((key) => server.name.includes(key)));
        supported.sort((a, b) => {
            const ai = sourceOrder.findIndex((key) => a.name.includes(key));
            const bi = sourceOrder.findIndex((key) => b.name.includes(key));
            if (ai !== bi)
                return ai - bi;
            return (a.dub ? 1 : 0) - (b.dub ? 1 : 0);
        });
        const groups = yield Promise.all(supported.map((server) => __awaiter(this, void 0, void 0, function* () {
            const sourceKey = Object.keys(SOURCE_EXTRACTORS).find((key) => server.name.includes(key));
            const source = sourceKey ? SOURCE_EXTRACTORS[sourceKey] : null;
            if (!source)
                return [];
            try {
                const resolved = yield source.extract(server.url);
                const variants = Array.isArray(resolved) ? resolved : [resolved];
                return variants.filter((variant) => isUsableHttpStreamUrlLocal(variant === null || variant === void 0 ? void 0 : variant.url)).map((variant) => (Object.assign({ name: 'AnimeAV1', title: '', url: variant.url.trim(), quality: `📺 ${sourceKey === 'Voe' ? 'Voe 720p' : source.label}\n${sourceKey === 'Voe' ? '720p' : '1080p'} | WEB-DL | Anime\n${getLangLabel(server.dub)}`, headers: variant.headers }, (variant.type ? { type: variant.type } : {}))));
            }
            catch (e) {
                console.warn(`[${source.label}] Falló resolviendo un servidor: ${e.message}`);
                return [];
            }
        })));
        const all = groups.flat();
        const seen = new Set();
        return all.filter((stream) => {
            const key = `${stream.url}|${stream.quality}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
    });
}
function fetchStreamsForSlugLocal(slug, type, epNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        // AnimeAV1 etiqueta algunas películas como Episodio 0 (confirmado en la
        // ficha de Circe no Majo). Para películas probamos 0 primero y solo usamos
        // 1 si el episodio 0 no contiene servidores ni produce URLs HLS utilizables.
        const episodeCandidates = type === 'movie'
            ? [...new Set([0, epNumber])]
            : [epNumber];
        for (const candidateEp of episodeCandidates) {
            let servers = [];
            try {
                servers = yield getEpisodeServers(slug, candidateEp);
            }
            catch (e) {
                console.warn(`[AnimeAV1] No se pudieron leer servidores de ${slug}/E${candidateEp}: ${e.message}`);
            }
            if (!servers.length) {
                console.warn(`[AnimeAV1] ${slug}/E${candidateEp} no contiene servidores soportados; probando alternativa`);
                continue;
            }
            const streams = yield extractAnimeAV1StreamsLocal(servers).catch((e) => {
                console.warn(`[AnimeAV1] Falló la extracción de ${slug}/E${candidateEp}: ${e.message}`);
                return [];
            });
            const usableStreams = (streams || []).filter((stream) => isUsableHttpStreamUrlLocal(stream === null || stream === void 0 ? void 0 : stream.url));
            if (usableStreams.length) {
                console.log(`[AnimeAV1] Episodio elegido ${slug}/E${candidateEp}: ${usableStreams.length} URL(s) HLS válidas`);
                return usableStreams;
            }
            console.warn(`[AnimeAV1] ${slug}/E${candidateEp} detectó servidores pero no produjo URLs HLS utilizables; probando alternativa`);
        }
        return [];
    });
}
function acceptSeasonMatchLocal(matchInfo, year, seasonNum, termRecord = {}) {
    var _a, _b, _c, _d;
    if (!matchInfo || !((_a = matchInfo.candidate) === null || _a === void 0 ? void 0 : _a.slug) || !matchInfo.accepted) {
        if (!matchInfo || !((_b = matchInfo.candidate) === null || _b === void 0 ? void 0 : _b.slug) || seasonNum <= 1)
            return false;
        if (!termRecord.seasonIdentity || termRecord.targetSeason !== seasonNum)
            return false;
        if (matchInfo.candidateSeason !== undefined && matchInfo.candidateSeason !== seasonNum)
            return false;
        const fullTitleExact = normalizeTitle((_c = matchInfo.candidate) === null || _c === void 0 ? void 0 : _c.title) === normalizeTitle(termRecord.term);
        const fullTokenSimilarity = wordSimilarity(termRecord.term, ((_d = matchInfo.candidate) === null || _d === void 0 ? void 0 : _d.title) || '');
        return Boolean(matchInfo.score >= 85 && (fullTitleExact || fullTokenSimilarity >= 0.85));
    }
    return true;
}
function resolveAnimeAV1LocalFresh(tmdbId, type, seasonNum, epNumber, cacheKey) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`[AnimeAV1] Fallback local 1.2.9: TMDB ${tmdbId} (${type}) S${seasonNum}E${epNumber}`);
        const [info, seasonInfo, altTitles] = yield Promise.all([
            getTMDBInfo(tmdbId, type),
            type === 'movie' ? Promise.resolve({ year: undefined, name: '', airDate: '' }) : getTMDBSeasonInfoLocal(tmdbId, seasonNum),
            getTMDBAlternativeTitlesLocal(tmdbId, type)
        ]);
        if (!info) {
            console.warn(`[AnimeAV1] TMDB no devolvió información para ${tmdbId}`);
            return [];
        }
        if (!looksLikeAnime(info)) {
            console.warn(`[AnimeAV1] Contenido descartado por filtro de anime: "${info.title}"`);
            return [];
        }
        const seasonYear = type === 'movie' ? info.year : (seasonInfo.year || info.year);
        // The series debut year is not valid proof for S2+; only a season-specific
        // TMDB year can constrain a higher-season catalog search.
        const targetSeasonYear = type === 'movie' || seasonNum === 1 ? seasonYear : seasonInfo.year;
        const baseDirectTerms = uniqueTitleRecordsLocal([
            { term: seasonNum > 1 && type !== 'movie' ? `${info.title} ${seasonNum}` : info.title, origin: 'tmdb-title' },
            { term: info.title, origin: 'tmdb-title' },
            { term: info.originalTitle, origin: 'tmdb-original-title' },
            { term: seasonInfo.name, origin: 'tmdb-season-title' },
            ...(altTitles || []).map((term) => ({ term, origin: 'tmdb-alternative' }))
        ], 12);
        const searchedTerms = new Set();
        const triedSlugs = new Set();
        let bestAttempt = null;
        let catalogError = null;
        const tryTerms = (terms, targetYear, phase) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            for (const recordValue of terms) {
                const record = typeof recordValue === 'string' ? { term: recordValue, origin: phase } : recordValue;
                const term = record.term;
                const normalized = normalizeTitle(term);
                if (!normalized)
                    continue;
                const yearsToTry = targetYear ? [targetYear, undefined] : [undefined];
                for (const year of yearsToTry) {
                    const evidenceKey = record.seasonIdentity ? `|verified-s${record.targetSeason}` : '';
                    const attemptKey = `${normalized}|${year !== null && year !== void 0 ? year : ''}${evidenceKey}`;
                    if (searchedTerms.has(attemptKey))
                        continue;
                    searchedTerms.add(attemptKey);
                    let candidates;
                    try {
                        candidates = yield searchAnimeAV1(term, year, seasonNum);
                    }
                    catch (error) {
                        catalogError = error;
                        console.warn(`[AnimeAV1] Búsqueda local (${record.origin || phase}) "${term}" año=${year !== null && year !== void 0 ? year : 'ninguno'} falló: ${error.message}`);
                        // A transport/HTTP failure is a catalog-wide failure, not a bad title.
                        // Stop issuing one request per alias when the site is unavailable.
                        return [];
                    }
                    const matchInfo = pickBestMatch(candidates, term, seasonNum);
                    if (!matchInfo)
                        continue;
                    const accepted = acceptSeasonMatchLocal(matchInfo, year, seasonNum, record);
                    if (!bestAttempt || matchInfo.score > bestAttempt.score)
                        bestAttempt = { term, title: (_a = matchInfo.candidate) === null || _a === void 0 ? void 0 : _a.title, score: matchInfo.score, accepted };
                    const match = matchInfo.candidate;
                    if (!accepted || !(match === null || match === void 0 ? void 0 : match.slug) || triedSlugs.has(match.slug))
                        continue;
                    triedSlugs.add(match.slug);
                    console.log(`[AnimeAV1] Match local (${record.origin || phase}): "${match.title}" slug=${match.slug} score=${matchInfo.score.toFixed(1)} gap=${matchInfo.gap.toFixed(1)} season=${(_b = matchInfo.candidateSeason) !== null && _b !== void 0 ? _b : '?'} term="${term}"`);
                    const streams = yield fetchStreamsForSlugLocal(match.slug, type, epNumber).catch((error) => {
                        console.warn(`[AnimeAV1] Error probando slug "${match.slug}": ${error.message}`);
                        return [];
                    });
                    if (streams.length) {
                        maintainResolverCache(animeAV1LocalCache, LOCAL_RESOLVER_CACHE_TTL_MS);
                        animeAV1LocalCache.set(cacheKey, { slug: match.slug, title: match.title, score: matchInfo.score, timestamp: Date.now() });
                        console.log(`[AnimeAV1] ✓ Resolver local encontró ${streams.length} streams`);
                        return streams;
                    }
                    console.warn(`[AnimeAV1] El candidato "${match.title}" no produjo streams; se probará otra alternativa`);
                }
            }
            return [];
        });
        let resolution = null;
        let aliInfo;
        if (seasonNum > 1 && type === 'tv') {
            const targetSpecificTerms = baseDirectTerms.filter((record) => getExplicitSeason(record.term) === seasonNum);
            // A couple of explicitly seasonal TMDB aliases are cheap and can solve the
            // case immediately. Do not sweep every language alias before AniList.
            if (targetSpecificTerms.length)
                resolution = yield tryTerms(targetSpecificTerms.slice(0, 2), targetSeasonYear, 'TMDB temporada');
            if (catalogError)
                return [];
            if (!resolution) {
                aliInfo = yield resolveAniListIdentityLocal(info, seasonNum, targetSeasonYear, [seasonInfo.name, ...(altTitles || [])]).catch((error) => {
                    console.warn(`[AniList] No se pudo resolver identidad de temporada: ${error.message}`);
                    return undefined;
                });
            }
            if (!resolution && (aliInfo === null || aliInfo === void 0 ? void 0 : aliInfo.seasonVerified) && aliInfo.seasonNum === seasonNum) {
                const seasonalSynonyms = (aliInfo.synonyms || []).slice().sort((a, b) => Number(getExplicitSeason(b) === seasonNum) - Number(getExplicitSeason(a) === seasonNum));
                const aliasTerms = uniqueTitleRecordsLocal([
                    { term: aliInfo.romajiTitle, origin: 'anilist-season-romaji', seasonIdentity: true, targetSeason: seasonNum },
                    ...seasonalSynonyms.map((term) => ({ term, origin: 'anilist-season-synonym', seasonIdentity: true, targetSeason: seasonNum })),
                    { term: aliInfo.englishTitle, origin: 'anilist-season-english', seasonIdentity: true, targetSeason: seasonNum },
                    { term: aliInfo.nativeTitle, origin: 'anilist-season-native', seasonIdentity: true, targetSeason: seasonNum }
                ], 6);
                resolution = yield tryTerms(aliasTerms, aliInfo.year || seasonYear, 'AniList temporada verificada');
                if (catalogError)
                    return [];
            }
            if (!resolution) {
                const safeFallbackTerms = baseDirectTerms.filter((record) => ['tmdb-title', 'tmdb-original-title'].includes(record.origin) || getExplicitSeason(record.term) === seasonNum).sort((a, b) => Number(getExplicitSeason(b.term) === seasonNum) - Number(getExplicitSeason(a.term) === seasonNum));
                resolution = yield tryTerms(safeFallbackTerms, targetSeasonYear, 'fallback TMDB seguro');
                if (catalogError)
                    return [];
            }
        }
        else {
            resolution = yield tryTerms(baseDirectTerms, seasonYear, 'TMDB');
            if (catalogError)
                return [];
            if (!resolution) {
                aliInfo = yield resolveAniListIdentityLocal(info, seasonNum, seasonYear, [seasonInfo.name, ...(altTitles || [])]).catch((error) => {
                    console.warn(`[AniList] No se pudo resolver identidad alternativa: ${error.message}`);
                    return undefined;
                });
                if (aliInfo) {
                    const aliasTerms = uniqueTitleRecordsLocal([
                        { term: aliInfo.romajiTitle, origin: 'anilist-romaji' },
                        { term: aliInfo.englishTitle, origin: 'anilist-english' },
                        { term: aliInfo.nativeTitle, origin: 'anilist-native' },
                        { term: seasonInfo.name, origin: 'tmdb-season-title' },
                        { term: info.title, origin: 'tmdb-title' },
                        { term: info.originalTitle, origin: 'tmdb-original-title' },
                        ...(aliInfo.synonyms || []).map((term) => ({ term, origin: 'anilist-synonym' })),
                        ...(altTitles || []).map((term) => ({ term, origin: 'tmdb-alternative' }))
                    ], 12);
                    resolution = yield tryTerms(aliasTerms, aliInfo.year || seasonYear, 'AniList/TMDB');
                    if (catalogError)
                        return [];
                }
            }
            if (!resolution) {
                // Legacy season-by-date lookup is kept only for S1/movies, where it cannot
                // silently convert an ordinal request into the wrong season.
                const legacyInfo = yield getAniListInfo(info.title, seasonNum).catch(() => undefined);
                if (legacyInfo) {
                    const legacyTerms = uniqueTitleRecordsLocal([
                        { term: legacyInfo.romajiTitle, origin: 'anilist-romaji-legacy' },
                        { term: info.title, origin: 'tmdb-title' },
                        { term: info.originalTitle, origin: 'tmdb-original-title' },
                        ...(altTitles || []).map((term) => ({ term, origin: 'tmdb-alternative' }))
                    ], 8);
                    resolution = yield tryTerms(legacyTerms, legacyInfo.year || seasonYear, 'AniList histórico');
                    if (catalogError)
                        return [];
                }
            }
        }
        if (!resolution) {
            console.warn(`[AnimeAV1] No se encontró un slug reproducible con confianza para TMDB ${tmdbId} S${seasonNum}; mejor candidato: ${bestAttempt ? `${bestAttempt.title} (${bestAttempt.score.toFixed(1)}, aceptado=${bestAttempt.accepted})` : 'ninguno'}`);
            return [];
        }
        return resolution;
    });
}
function resolveAnimeAV1Local(tmdbId, type, season, episode) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!tmdbId || !type)
            return [];
        const seasonNum = type === 'movie' ? 1 : (season ? Number(season) : 1);
        const epNumber = type === 'movie' ? 1 : (episode !== undefined ? Number(episode) : 1);
        const key = resolverCacheKey(tmdbId, type, seasonNum);
        const cached = animeAV1LocalCache.get(key);
        if (cached && Date.now() - cached.timestamp < LOCAL_RESOLVER_CACHE_TTL_MS) {
            animeAV1LocalCache.delete(key);
            animeAV1LocalCache.set(key, cached);
            console.log(`[AnimeAV1] Caché del resolver local: TMDB ${tmdbId} S${seasonNum} -> ${cached.slug}`);
            const streams = yield fetchStreamsForSlugLocal(cached.slug, type, epNumber).catch(() => []);
            if (streams.length)
                return streams;
            animeAV1LocalCache.delete(key);
            console.warn('[AnimeAV1] Caché local sin streams; se vuelve a resolver');
        }
        else if (cached)
            animeAV1LocalCache.delete(key);
        try {
            return yield resolveAnimeAV1LocalFresh(tmdbId, type, seasonNum, epNumber, key);
        }
        catch (e) {
            console.error(`[AnimeAV1] Error del fallback local: ${e.message}`);
            // Ultima oportunidad: el método local previo, conservado sin tocar sus
            // extractores, ayuda a evitar regresiones en casos ya soportados.
            if (type === 'movie' || seasonNum === 1) {
                try {
                    return yield resolveAnimeAV1LocalLegacy(tmdbId, type, seasonNum, epNumber);
                }
                catch (legacyError) {
                    console.error(`[AnimeAV1] Método local heredado falló: ${legacyError.message}`);
                    return [];
                }
            }
            // For S2+, fail closed: the previous resolver could accept a markerless
            // result from title/year alone, precisely the ambiguity this fallback fixes.
            return [];
        }
    });
}
exports.getStreams = function (tmdbId, type, season, episode) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!tmdbId || !type)
            return [];
        const seasonNum = type === 'movie' ? 1 : (season ? Number(season) : 1);
        const epNumber = type === 'movie' ? 1 : (episode !== undefined ? Number(episode) : 1);
        console.log(`[AnimeAV1] 1.2.9 (remoto principal + fallback local) Resolviendo: TMDB ${tmdbId} (${type}) S${seasonNum}E${epNumber}`);
        try {
            const identity = yield getRemoteAnimeIdentity(tmdbId, type, seasonNum);
            let streams = yield fetchStreamsForSlugLocal(identity.slug, type, epNumber);
            if (streams.length) {
                console.log(`[AnimeAV1] ✓ Resolver remoto confirmó slug "${identity.slug}" y entregó ${streams.length} streams`);
                return streams;
            }
            console.warn(`[AnimeAV1] El resolver remoto devolvió slug "${identity.slug}" pero no streams; se activa fallback local`);
            animeAV1RemoteCache.delete(resolverCacheKey(tmdbId, type, seasonNum));
        }
        catch (e) {
            console.warn(`[AnimeAV1] Resolver remoto falló: ${e.message}; se activa fallback local`);
        }
        try {
            const streams = yield resolveAnimeAV1Local(tmdbId, type, seasonNum, epNumber);
            if (streams.length)
                console.log(`[AnimeAV1] ✓ Fallback local devolvió ${streams.length} streams`);
            return streams || [];
        }
        catch (e) {
            console.error(`[AnimeAV1] Falló el flujo remoto/local: ${e.message}`);
            return [];
        }
    });
};
