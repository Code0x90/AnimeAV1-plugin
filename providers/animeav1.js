// providers/animeav1.js
// Provider Nuvio para AnimeAV1 (https://animeav1.com)
// Sources activos: HLS de Zilla y HLS de Voe.
//
// Contrato Nuvio: exports.getStreams(tmdbId, type, season, episode) -> Promise<Array<Stream>>
// Stream: { name, title, url, quality, headers? }
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var e_1, _a;
var ANIMEAV1_BASE = "https://animeav1.com";
var TMDB_API_KEY = "56db0ec297530920213e1503706b81ff";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
// Switch de sources: true/false para activar o desactivar cada uno sin tocar
// el resto del código. Se aplica al registrar SOURCE_EXTRACTORS más abajo —
// un source en false ni siquiera se prueba/extrae para ese episodio.
var ENABLED_SOURCES = {
    HLS: true,
    Voe: true,
};
// Servidores soportados: nombre tal como aparece en el HTML/__data.json de
// AnimeAV1 -> función extractora que resuelve el link directo reproducible.
// Para sumar un nuevo source: 1) agregar su extractor más abajo, 2) agregarlo
// al registro (con su entrada en ENABLED_SOURCES si quieres poder apagarlo).
var SOURCE_EXTRACTORS = {}; // se completa al final del archivo, una vez definidos los extractores
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
    return __awaiter(this, void 0, void 0, function () {
        var path, url, data, title, dateStr, year, originCountries, genreIds, isAnimation, originalTitle;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    path = type === "movie" ? "movie" : "tv";
                    url = "https://api.themoviedb.org/3/".concat(path, "/").concat(tmdbId, "?api_key=").concat(TMDB_API_KEY, "&language=en-US");
                    return [4 /*yield*/, fetch(url, { headers: { "User-Agent": UA } }).then(function (r) { return r.json(); })];
                case 1:
                    data = _a.sent();
                    if (!data || data.success === false)
                        return [2 /*return*/, null];
                    title = data.title || data.name || data.original_title || data.original_name;
                    dateStr = data.release_date || data.first_air_date;
                    year = dateStr ? new Date(dateStr).getFullYear() : undefined;
                    if (!title)
                        return [2 /*return*/, null
                            // origin_country: en /tv/{id} viene directo como array de códigos ISO
                            // (ej. ["JP"]); en /movie/{id} no existe ese campo, el equivalente es
                            // production_countries (array de {iso_3166_1, name}).
                        ];
                    originCountries = type === "movie"
                        ? (data.production_countries || []).map(function (c) { return c.iso_3166_1; })
                        : (data.origin_country || []);
                    genreIds = (data.genres || []).map(function (g) { return g.id; });
                    isAnimation = genreIds.includes(16);
                    originalTitle = data.original_title || data.original_name || title;
                    return [2 /*return*/, { title: title, originalTitle: originalTitle, year: year, originCountries: originCountries, isAnimation: isAnimation }];
            }
        });
    });
}
// Países de origen asociados a anime/animación asiática en TMDB. Se usa para
// descartar temprano contenido que claramente no es anime (ahorra requests
// inútiles a AnimeAV1 cuando alguien busca, por ejemplo, una serie occidental).
var ASIAN_COUNTRIES = ['JP', 'CN', 'KR', 'TW', 'HK'];
function looksLikeAsianOrigin(originCountries) {
    // Si TMDB no dio el dato, no bloqueamos — es mejor intentar la búsqueda
    // igual que descartar por falta de información.
    if (!Array.isArray(originCountries) || originCountries.length === 0)
        return true;
    return originCountries.some(function (c) { return ASIAN_COUNTRIES.includes(c); });
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
    return __awaiter(this, void 0, void 0, function () {
        var url, data, airDate, year, e_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    url = "https://api.themoviedb.org/3/tv/".concat(tmdbId, "/season/").concat(seasonNum, "?api_key=").concat(TMDB_API_KEY, "&language=en-US");
                    return [4 /*yield*/, fetch(url, { headers: { "User-Agent": UA } }).then(function (r) {
                            if (!r.ok)
                                throw Error("HTTP error! Status: ".concat(r.status));
                            return r.json();
                        })];
                case 1:
                    data = _a.sent();
                    airDate = data === null || data === void 0 ? void 0 : data.air_date;
                    year = airDate ? new Date(airDate).getFullYear() : undefined;
                    console.log("[TMDB] Temporada ".concat(seasonNum, ": air_date=\"").concat(airDate, "\" -> year=").concat(year));
                    return [2 /*return*/, year];
                case 2:
                    e_2 = _a.sent();
                    console.warn("[TMDB] getSeasonYear fall\u00F3 (temporada ".concat(seasonNum, "): ").concat(e_2.message));
                    return [2 /*return*/, undefined];
                case 3: return [2 /*return*/];
            }
        });
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
var ANILIST_SEASON_SUFFIX_RE = /\s+(?:\d+(?:st|nd|rd|th)\s+season|season\s+\d+(?:\s+part\s+\d+)?|part\s+\d+)\s*$/i;
function anilistBaseTitle(romaji) {
    return romaji.replace(ANILIST_SEASON_SUFFIX_RE, '').trim();
}
function getAniListInfo(title, seasonNum) {
    return __awaiter(this, void 0, void 0, function () {
        var query, resp, json, results, anchor, baseRomaji_1, sameSeries, withDate, target, e_3;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 3, , 4]);
                    query = "query ($search: String) {\n      Page(page: 1, perPage: 15) {\n        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {\n          id\n          title { romaji english }\n          seasonYear\n          startDate { year month day }\n        }\n      }\n    }";
                    return [4 /*yield*/, fetch("https://graphql.anilist.co", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "Accept": "application/json" },
                            body: JSON.stringify({ query: query, variables: { search: title } })
                        })];
                case 1:
                    resp = _d.sent();
                    if (!resp.ok)
                        throw Error("HTTP error! Status: ".concat(resp.status));
                    return [4 /*yield*/, resp.json()];
                case 2:
                    json = _d.sent();
                    results = (_b = (_a = json === null || json === void 0 ? void 0 : json.data) === null || _a === void 0 ? void 0 : _a.Page) === null || _b === void 0 ? void 0 : _b.media;
                    if (!Array.isArray(results) || results.length === 0) {
                        console.warn("[AniList] Sin resultados para \"".concat(title, "\""));
                        return [2 /*return*/, undefined];
                    }
                    anchor = results[0];
                    baseRomaji_1 = anilistBaseTitle(((_c = anchor.title) === null || _c === void 0 ? void 0 : _c.romaji) || '');
                    if (!baseRomaji_1)
                        return [2 /*return*/, undefined];
                    sameSeries = results.filter(function (m) { var _a; return anilistBaseTitle(((_a = m.title) === null || _a === void 0 ? void 0 : _a.romaji) || '').toLowerCase() === baseRomaji_1.toLowerCase(); });
                    withDate = sameSeries
                        .map(function (m) {
                        var _a, _b;
                        var sd = m.startDate;
                        var year = (_a = m.seasonYear) !== null && _a !== void 0 ? _a : sd === null || sd === void 0 ? void 0 : sd.year;
                        if (!year)
                            return null;
                        var sortKey = (sd === null || sd === void 0 ? void 0 : sd.year) ? "".concat(sd.year, "-").concat(String(sd.month || 1).padStart(2, '0'), "-").concat(String(sd.day || 1).padStart(2, '0')) : "".concat(year, "-01-01");
                        return { title: (_b = m.title) === null || _b === void 0 ? void 0 : _b.romaji, year: year, sortKey: sortKey };
                    })
                        .filter(Boolean)
                        .sort(function (a, b) { return a.sortKey.localeCompare(b.sortKey); });
                    console.log("[AniList] \"".concat(baseRomaji_1, "\" \u2014 ").concat(withDate.length, " temporada(s) encontradas: ").concat(withDate.map(function (w) { return "".concat(w.title, "(").concat(w.year, ")"); }).join(', ')));
                    target = withDate[seasonNum - 1];
                    if (!target) {
                        console.warn("[AniList] No hay entrada para temporada ".concat(seasonNum, " (solo ").concat(withDate.length, " encontradas)"));
                        return [2 /*return*/, undefined];
                    }
                    console.log("[AniList] Temporada ".concat(seasonNum, " -> \"").concat(target.title, "\" year=").concat(target.year));
                    return [2 /*return*/, { year: target.year, romajiTitle: target.title }];
                case 3:
                    e_3 = _d.sent();
                    console.warn("[AniList] getAniListInfo fall\u00F3: ".concat(e_3.message));
                    return [2 /*return*/, undefined];
                case 4: return [2 /*return*/];
            }
        });
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
    var params = new URLSearchParams();
    if (query)
        params.set('search', query);
    if (year) {
        params.set('minYear', year);
        params.set('maxYear', year);
    }
    if (page)
        params.set('page', page);
    return "".concat(ANIMEAV1_BASE, "/catalogo?").concat(params.toString());
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
    return __awaiter(this, void 0, void 0, function () {
        var html, objBlockRegex, media, m;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch(url, { headers: { "User-Agent": UA } }).then(function (resp) {
                        if (!resp.ok)
                            throw Error("HTTP error! Status: ".concat(resp.status));
                        return resp.text();
                    })
                    // Cada resultado sigue el patrón: { id: "X", title: "Y", synopsis: "Z", categoryId: N, slug: "W" ...
                    // synopsis puede contener comillas escapadas (\") y saltos de línea (\n), contemplados en el regex.
                ];
                case 1:
                    html = _a.sent();
                    objBlockRegex = /\{\s*id:\s*"([^"]+)",\s*title:\s*"((?:[^"\\]|\\.)*)",\s*synopsis:\s*"((?:[^"\\]|\\.)*)",\s*categoryId:\s*\d+,\s*slug:\s*"([^"]+)"/g;
                    media = [];
                    while ((m = objBlockRegex.exec(html)) !== null) {
                        media.push({
                            id: m[1],
                            title: m[2].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
                            synopsis: m[3].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
                            slug: m[4]
                        });
                    }
                    return [2 /*return*/, { media: media }];
            }
        });
    });
}
/**
 * Busca un anime en AnimeAV1 probando: query original, sanitizada, primeras 3 palabras.
 * @returns {Promise<Array>}
 */
var SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
var SEARCH_CACHE_MAX_ENTRIES = 1000;
var animeAV1SearchCache = new Map();
function maintainAnimeAV1SearchCache(now) {
    var e_4, _a;
    if (now === void 0) { now = Date.now(); }
    try {
        for (var animeAV1SearchCache_1 = __values(animeAV1SearchCache), animeAV1SearchCache_1_1 = animeAV1SearchCache_1.next(); !animeAV1SearchCache_1_1.done; animeAV1SearchCache_1_1 = animeAV1SearchCache_1.next()) {
            var _b = __read(animeAV1SearchCache_1_1.value, 2), key = _b[0], entry = _b[1];
            if (now - entry.timestamp >= SEARCH_CACHE_TTL_MS)
                animeAV1SearchCache.delete(key);
        }
    }
    catch (e_4_1) { e_4 = { error: e_4_1 }; }
    finally {
        try {
            if (animeAV1SearchCache_1_1 && !animeAV1SearchCache_1_1.done && (_a = animeAV1SearchCache_1.return)) _a.call(animeAV1SearchCache_1);
        }
        finally { if (e_4) throw e_4.error; }
    }
    while (animeAV1SearchCache.size >= SEARCH_CACHE_MAX_ENTRIES) {
        var oldestKey = animeAV1SearchCache.keys().next().value;
        if (oldestKey === undefined)
            break;
        animeAV1SearchCache.delete(oldestKey);
    }
}
function isStrongSearchMatch(candidates, searchTerm, seasonNum) {
    var match = pickBestMatch(candidates, searchTerm, seasonNum);
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
    return __awaiter(this, arguments, void 0, function (query, year, seasonNum) {
        var runSearch, sanitized, variants, aggregate, seen, variants_1, variants_1_1, variant, rows, e_5, rows_1, rows_1_1, candidate, key, strongMatch, exactFullTitle, e_6_1;
        var e_6, _a, e_7, _b;
        var _this = this;
        if (seasonNum === void 0) { seasonNum = 1; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    runSearch = function (searchQuery) { return __awaiter(_this, void 0, void 0, function () {
                        var normalizedQuery, cacheKey, cached, data, media;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    normalizedQuery = normalizeTitle(searchQuery);
                                    cacheKey = "".concat(normalizedQuery, "|").concat(year !== null && year !== void 0 ? year : '');
                                    cached = animeAV1SearchCache.get(cacheKey);
                                    if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
                                        // Touch the key to keep frequently-used entries away from the eviction end.
                                        animeAV1SearchCache.delete(cacheKey);
                                        animeAV1SearchCache.set(cacheKey, cached);
                                        console.log("[AnimeAV1] Cach\u00E9 b\u00FAsqueda: \"".concat(searchQuery, "\""));
                                        return [2 /*return*/, cached.media];
                                    }
                                    if (cached)
                                        animeAV1SearchCache.delete(cacheKey);
                                    return [4 /*yield*/, searchAnimesBySpecificURL(buildSearchURL(searchQuery, undefined, year))];
                                case 1:
                                    data = _a.sent();
                                    media = Array.isArray(data === null || data === void 0 ? void 0 : data.media) ? data.media : [];
                                    maintainAnimeAV1SearchCache();
                                    animeAV1SearchCache.set(cacheKey, { timestamp: Date.now(), media: media });
                                    return [2 /*return*/, media];
                            }
                        });
                    }); };
                    sanitized = sanitizeQuery(query);
                    variants = uniqueLocalTitles([
                        query,
                        sanitized,
                        (sanitized || query).split(' ').filter(Boolean).slice(0, 3).join(' ')
                    ], 3);
                    aggregate = [];
                    seen = new Set();
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 9, 10, 11]);
                    variants_1 = __values(variants), variants_1_1 = variants_1.next();
                    _c.label = 2;
                case 2:
                    if (!!variants_1_1.done) return [3 /*break*/, 8];
                    variant = variants_1_1.value;
                    rows = void 0;
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, runSearch(variant)];
                case 4:
                    rows = _c.sent();
                    return [3 /*break*/, 6];
                case 5:
                    e_5 = _c.sent();
                    console.warn("[AnimeAV1] Variante de b\u00FAsqueda \"".concat(variant, "\" fall\u00F3: ").concat(e_5.message));
                    // Empty catalog results are cached as []. Exceptions mean transport/HTTP
                    // failure, so retrying equivalent variants would only multiply requests.
                    throw e_5;
                case 6:
                    try {
                        for (rows_1 = (e_7 = void 0, __values(rows)), rows_1_1 = rows_1.next(); !rows_1_1.done; rows_1_1 = rows_1.next()) {
                            candidate = rows_1_1.value;
                            key = (candidate === null || candidate === void 0 ? void 0 : candidate.slug) || (candidate === null || candidate === void 0 ? void 0 : candidate.id) || normalizeTitle(candidate === null || candidate === void 0 ? void 0 : candidate.title);
                            if (!key || seen.has(key))
                                continue;
                            seen.add(key);
                            aggregate.push(candidate);
                        }
                    }
                    catch (e_7_1) { e_7 = { error: e_7_1 }; }
                    finally {
                        try {
                            if (rows_1_1 && !rows_1_1.done && (_b = rows_1.return)) _b.call(rows_1);
                        }
                        finally { if (e_7) throw e_7.error; }
                    }
                    strongMatch = pickBestMatch(aggregate, query, seasonNum);
                    exactFullTitle = aggregate.some(function (candidate) {
                        if (normalizeTitle(candidate === null || candidate === void 0 ? void 0 : candidate.title) !== normalizeTitle(query))
                            return false;
                        var candidateSeason = getExplicitSeason("".concat((candidate === null || candidate === void 0 ? void 0 : candidate.title) || '', " ").concat((candidate === null || candidate === void 0 ? void 0 : candidate.slug) || ''));
                        return candidateSeason === undefined || candidateSeason === seasonNum;
                    });
                    if ((strongMatch === null || strongMatch === void 0 ? void 0 : strongMatch.accepted) || exactFullTitle)
                        return [2 /*return*/, aggregate];
                    _c.label = 7;
                case 7:
                    variants_1_1 = variants_1.next();
                    return [3 /*break*/, 2];
                case 8: return [3 /*break*/, 11];
                case 9:
                    e_6_1 = _c.sent();
                    e_6 = { error: e_6_1 };
                    return [3 /*break*/, 11];
                case 10:
                    try {
                        if (variants_1_1 && !variants_1_1.done && (_a = variants_1.return)) _a.call(variants_1);
                    }
                    finally { if (e_6) throw e_6.error; }
                    return [7 /*endfinally*/];
                case 11: return [2 /*return*/, aggregate];
            }
        });
    });
}
// Patrones que indican temporada 2+ en el título del catálogo.
var HIGHER_SEASON_PATTERNS = [
    /\b2nd\s+season\b/i, /\b3rd\s+season\b/i, /\b4th\s+season\b/i,
    /\bseason\s+[2-9]\b/i, /\bpart\s+[2-9]\b/i,
    /\b[2-9]\s*(?:st|nd|rd|th)?\s+temporada\b/i,
];
var STOP_WORDS = new Set([
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
        .filter(function (token) { return token && !STOP_WORDS.has(token); });
}
function getExplicitSeason(title) {
    var value = normalizeTitle(title);
    var m = value.match(/\bseason\s*(\d+)\b/);
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
    var raw = String(title || '');
    m = raw.match(/第\s*(\d+)\s*(?:期|季)/);
    if (m)
        return Number(m[1]);
    m = raw.match(/第\s*([一二三四五六七八九十百]+)\s*(?:期|季)/);
    if (m) {
        var digits = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
        var numeral = m[1];
        if (digits[numeral] != null)
            return digits[numeral];
        if (numeral.startsWith('十'))
            return 10 + (digits[numeral.slice(1)] || 0);
        if (numeral.includes('十')) {
            var _a = __read(numeral.split('十'), 2), tens = _a[0], ones = _a[1];
            return (digits[tens] || 1) * 10 + (digits[ones] || 0);
        }
    }
    return undefined;
}
function wordSimilarity(target, candidate) {
    var e_8, _a;
    var targetTokens = __spreadArray([], __read(new Set(titleTokens(target))), false);
    var candidateTokens = new Set(titleTokens(candidate));
    if (!targetTokens.length)
        return 0;
    var matched = 0;
    try {
        for (var targetTokens_1 = __values(targetTokens), targetTokens_1_1 = targetTokens_1.next(); !targetTokens_1_1.done; targetTokens_1_1 = targetTokens_1.next()) {
            var token = targetTokens_1_1.value;
            if (candidateTokens.has(token))
                matched++;
        }
    }
    catch (e_8_1) { e_8 = { error: e_8_1 }; }
    finally {
        try {
            if (targetTokens_1_1 && !targetTokens_1_1.done && (_a = targetTokens_1.return)) _a.call(targetTokens_1);
        }
        finally { if (e_8) throw e_8.error; }
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
    var raw = String(target || '').trim();
    if (!raw)
        return [];
    var aliases = [];
    var add = function (value) {
        var normalized = normalizeTitle(value);
        if (!normalized || normalized.length < 3)
            return;
        if (!aliases.includes(normalized))
            aliases.push(normalized);
    };
    // Alias/título corto al comienzo del título largo.
    var prefix = raw.match(/^\s*(.+?)\s*(?:~|:|\s[-–—]\s|\(|\[)/);
    if (prefix)
        add(prefix[1]);
    // En títulos que usan comillas alrededor de un subtítulo, conserva también
    // el texto que queda antes de la primera comilla/apertura delimitadora.
    var quotedPrefix = raw.match(/^\s*(.+?)\s*(?:["“”]|«)/);
    if (quotedPrefix)
        add(quotedPrefix[1]);
    return aliases;
}
function getAliasExactMatch(target, candidate) {
    var normalizedCandidate = normalizeTitle(candidate);
    if (!normalizedCandidate)
        return undefined;
    return getTitleAliases(target).find(function (alias) { return alias === normalizedCandidate; });
}
/**
 * Puntúa un candidato usando coincidencia por palabras + alias + temporada.
 * El año se utiliza en la consulta a AnimeAV1 (minYear/maxYear), por lo que
 * no se inventa una puntuación de año que el resultado del catálogo no expone.
 *
 * Devuelve { candidate, score, similarity, candidateSeason }.
 */
function scoreCandidate(candidate, searchTerm, seasonNum) {
    var candidateTitle = (candidate === null || candidate === void 0 ? void 0 : candidate.title) || '';
    // AnimeAV1 sometimes omits the season from the display title but keeps it
    // in the slug. Use both for season classification, never for title equality.
    var candidateIdentity = "".concat(candidateTitle, " ").concat((candidate === null || candidate === void 0 ? void 0 : candidate.slug) || '').trim();
    var target = normalizeTitle(searchTerm);
    var normalizedCandidate = normalizeTitle(candidateTitle);
    var similarity = wordSimilarity(searchTerm, candidateTitle);
    var aliasExact = getAliasExactMatch(searchTerm, candidateTitle);
    var explicitSeason = getExplicitSeason(candidateIdentity);
    var score = similarity * 60;
    if (normalizedCandidate === target)
        score += 30;
    if (aliasExact && seasonNum === 1)
        score = Math.max(score, 100);
    if (seasonNum > 1) {
        if (explicitSeason === seasonNum)
            score += 45;
        else if (explicitSeason !== undefined)
            score -= 45;
        var targetHasSeasonNumber = new RegExp("\\b".concat(seasonNum, "\\b")).test(target);
        if (targetHasSeasonNumber && new RegExp("\\b".concat(seasonNum, "\\b")).test(normalizedCandidate))
            score += 15;
    }
    else if (explicitSeason !== undefined && explicitSeason > 1) {
        score -= 55;
    }
    return { candidate: candidate, score: score, similarity: similarity, candidateSeason: explicitSeason, aliasExact: aliasExact };
}
function pickBestMatch(candidates, searchTerm, seasonNum) {
    if (!Array.isArray(candidates) || candidates.length === 0)
        return null;
    var scored = candidates
        .map(function (candidate) { return scoreCandidate(candidate, searchTerm, seasonNum); })
        .sort(function (a, b) { return b.score - a.score; });
    // A wrong-season marker must never outrank a markerless candidate that may
    // later be verified by AniList, nor mask a valid result later in the catalog.
    var seasonCompatible = scored.filter(function (entry) {
        return entry.candidateSeason === undefined || entry.candidateSeason === seasonNum;
    });
    var pool = seasonCompatible.length ? seasonCompatible : scored;
    if (seasonNum > 1) {
        var explicit = pool.filter(function (entry) { return entry.candidateSeason === seasonNum && entry.score >= 65; });
        if (explicit.length)
            pool = explicit;
    }
    pool.sort(function (a, b) { return b.score - a.score; });
    var best = pool[0];
    var second = pool[1];
    var gap = second ? best.score - second.score : best.score;
    var hasExpectedSeason = seasonNum === 1
        ? best.candidateSeason === undefined || best.candidateSeason === 1
        : best.candidateSeason === seasonNum;
    var threshold = seasonNum > 1 ? 65 : 50;
    var accepted = best.score >= threshold && hasExpectedSeason;
    return __assign(__assign({}, best), { gap: gap, accepted: accepted, candidates: scored });
}
// ─────────────────────────────────────────────
// Extracción de servidores del episodio (__data.json + fallback HTML)
// ─────────────────────────────────────────────
/**
 * Obtiene la lista de servidores (embeds SUB/DUB) de un episodio dado.
 * Solo interesan los servidores HLS de Zilla y Voe.
 */
function getEpisodeServers(slug, epNumber) {
    return __awaiter(this, void 0, void 0, function () {
        function matchesSupportedSource(name) {
            return Object.keys(SOURCE_EXTRACTORS).some(function (key) { return name.includes(key); });
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
            if (typeof value === 'number' && dataArray_1[value] !== undefined) {
                var resolved = dataArray_1[value];
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
                var obj = typeof entry === 'number' ? dataArray_1[entry] : entry;
                if (!obj || typeof obj !== 'object')
                    return null;
                var serverName = resolveField(obj.server);
                var url = resolveField(obj.url);
                if (typeof serverName !== 'string' || typeof url !== 'string')
                    return null;
                return { name: serverName, url: url };
            }
            catch (_) {
                return null;
            }
        }
        function extractServers(listOrIndex, dub) {
            var e_12, _a;
            var list = typeof listOrIndex === 'number' ? dataArray_1[listOrIndex] : listOrIndex;
            if (!Array.isArray(list))
                return;
            try {
                for (var list_1 = __values(list), list_1_1 = list_1.next(); !list_1_1.done; list_1_1 = list_1.next()) {
                    var entry = list_1_1.value;
                    var server = resolveServer(entry);
                    if (!server || !server.url.startsWith('http'))
                        continue;
                    if (!matchesSupportedSource(server.name))
                        continue; // ── solo sources soportados ──
                    servers_1.push({ name: server.name, url: server.url, dub: dub });
                    console.log("[AnimeAV1] Servidor detectado: ".concat(server.name, " (").concat(dub ? 'DUB' : 'SUB', ")"));
                }
            }
            catch (e_12_1) { e_12 = { error: e_12_1 }; }
            finally {
                try {
                    if (list_1_1 && !list_1_1.done && (_a = list_1.return)) _a.call(list_1);
                }
                finally { if (e_12) throw e_12.error; }
            }
        }
        var ep, pageUrl, jsonUrl, resp, root, nodes, dataArray_1, nodes_1, nodes_1_1, node, hasEmbeds, episodeObj, embedsIndex, embeds, servers_1, subIndex, dubIndex, downloadsIndex, downloads, dlSubIndex, dlDubIndex, e_9, html, metadataJSON, serversObj, serversObjDUB, downloadObj, downloadObjDUB, raw, servers, e_10;
        var e_11, _a;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    ep = (epNumber !== undefined && epNumber !== null) ? Number(epNumber) : 1;
                    pageUrl = "".concat(ANIMEAV1_BASE, "/media/").concat(slug, "/").concat(ep);
                    console.log("[AnimeAV1] GetEpisodeServers: ".concat(pageUrl));
                    _l.label = 1;
                case 1:
                    _l.trys.push([1, 4, , 5]);
                    jsonUrl = "".concat(pageUrl, "/__data.json");
                    return [4 /*yield*/, fetch(jsonUrl, { headers: { "User-Agent": UA, "Referer": ANIMEAV1_BASE + "/" } })];
                case 2:
                    resp = _l.sent();
                    if (!resp.ok)
                        throw Error("HTTP error! Status: ".concat(resp.status));
                    return [4 /*yield*/, resp.json()];
                case 3:
                    root = _l.sent();
                    nodes = root === null || root === void 0 ? void 0 : root.nodes;
                    if (!Array.isArray(nodes))
                        throw Error("No nodes in __data.json");
                    dataArray_1 = null;
                    try {
                        for (nodes_1 = __values(nodes), nodes_1_1 = nodes_1.next(); !nodes_1_1.done; nodes_1_1 = nodes_1.next()) {
                            node = nodes_1_1.value;
                            if ((node === null || node === void 0 ? void 0 : node.data) && Array.isArray(node.data)) {
                                hasEmbeds = node.data.some(function (d) { return d && typeof d === 'object' && 'embeds' in d; });
                                if (hasEmbeds) {
                                    dataArray_1 = node.data;
                                    break;
                                }
                            }
                        }
                    }
                    catch (e_11_1) { e_11 = { error: e_11_1 }; }
                    finally {
                        try {
                            if (nodes_1_1 && !nodes_1_1.done && (_a = nodes_1.return)) _a.call(nodes_1);
                        }
                        finally { if (e_11) throw e_11.error; }
                    }
                    if (!dataArray_1)
                        throw Error("No data array with embeds found");
                    episodeObj = dataArray_1.find(function (d) { return d && typeof d === 'object' && 'embeds' in d; });
                    if (!episodeObj)
                        throw Error("No episode object found");
                    embedsIndex = episodeObj.embeds;
                    embeds = dataArray_1[embedsIndex];
                    if (!embeds || typeof embeds !== 'object')
                        throw Error("No embeds object");
                    servers_1 = [];
                    subIndex = (_b = embeds.SUB) !== null && _b !== void 0 ? _b : embeds.sub;
                    dubIndex = (_c = embeds.DUB) !== null && _c !== void 0 ? _c : embeds.dub;
                    if (subIndex !== undefined)
                        extractServers(subIndex, false);
                    if (dubIndex !== undefined)
                        extractServers(dubIndex, true);
                    downloadsIndex = episodeObj.downloads;
                    if (downloadsIndex !== undefined) {
                        downloads = dataArray_1[downloadsIndex];
                        if (downloads && typeof downloads === 'object') {
                            dlSubIndex = (_d = downloads.SUB) !== null && _d !== void 0 ? _d : downloads.sub;
                            dlDubIndex = (_e = downloads.DUB) !== null && _e !== void 0 ? _e : downloads.dub;
                            if (dlSubIndex !== undefined)
                                extractServers(dlSubIndex, false);
                            if (dlDubIndex !== undefined)
                                extractServers(dlDubIndex, true);
                        }
                    }
                    if (servers_1.length > 0) {
                        console.log("[AnimeAV1] __data.json OK: ".concat(servers_1.length, " servidores soportados"));
                        return [2 /*return*/, servers_1];
                    }
                    throw Error("__data.json returned 0 servidores soportados, falling back");
                case 4:
                    e_9 = _l.sent();
                    console.warn("[AnimeAV1] __data.json fall\u00F3 (".concat(e_9.message, "), probando HTML scraping"));
                    return [3 /*break*/, 5];
                case 5:
                    _l.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, fetch(pageUrl, { headers: { "User-Agent": UA } }).then(function (resp) {
                            if (!resp.ok)
                                throw Error("HTTP error! Status: ".concat(resp.status));
                            return resp.text();
                        })
                        // Antes se usaba cheerio para localizar el <script> con kit.start(...);
                        // como solo hace falta encontrar ESE bloque de texto dentro del HTML
                        // completo (no navegar el DOM), una regex simple lo aísla igual de bien.
                    ];
                case 6:
                    html = _l.sent();
                    metadataJSON = (_f = html.match(/kit\.start\(app,\s*element,\s*\{[\s\S]*/)) === null || _f === void 0 ? void 0 : _f[0];
                    serversObj = (_g = metadataJSON === null || metadataJSON === void 0 ? void 0 : metadataJSON.match(/embeds:\s?.*?SUB:\s?(\[.*?\])/)) === null || _g === void 0 ? void 0 : _g[1];
                    serversObjDUB = (_h = metadataJSON === null || metadataJSON === void 0 ? void 0 : metadataJSON.match(/embeds:\s?.*?DUB:\s?(\[.*?\])/)) === null || _h === void 0 ? void 0 : _h[1];
                    downloadObj = (_j = metadataJSON === null || metadataJSON === void 0 ? void 0 : metadataJSON.match(/downloads:\s?.*?SUB:\s?(\[.*?\])/)) === null || _j === void 0 ? void 0 : _j[1];
                    downloadObjDUB = (_k = metadataJSON === null || metadataJSON === void 0 ? void 0 : metadataJSON.match(/downloads:\s?.*?DUB:\s?(\[.*?\])/)) === null || _k === void 0 ? void 0 : _k[1];
                    raw = [];
                    if (serversObj)
                        raw = raw.concat(serversObj.split("},").map(function (s) { var _a, _b; return ({ title: (_a = s.match(/server:\s?"(.*?)"/)) === null || _a === void 0 ? void 0 : _a[1], code: (_b = s.match(/url:\s?"(.*?)"/)) === null || _b === void 0 ? void 0 : _b[1], dub: false }); }));
                    if (downloadObj)
                        raw = raw.concat(downloadObj.split("},").map(function (s) { var _a, _b; return ({ title: (_a = s.match(/server:\s?"(.*?)"/)) === null || _a === void 0 ? void 0 : _a[1], code: (_b = s.match(/url:\s?"(.*?)"/)) === null || _b === void 0 ? void 0 : _b[1], dub: false }); }));
                    if (serversObjDUB)
                        raw = raw.concat(serversObjDUB.split("},").map(function (s) { var _a, _b; return ({ title: (_a = s.match(/server:\s?"(.*?)"/)) === null || _a === void 0 ? void 0 : _a[1], code: (_b = s.match(/url:\s?"(.*?)"/)) === null || _b === void 0 ? void 0 : _b[1], dub: true }); }));
                    if (downloadObjDUB)
                        raw = raw.concat(downloadObjDUB.split("},").map(function (s) { var _a, _b; return ({ title: (_a = s.match(/server:\s?"(.*?)"/)) === null || _a === void 0 ? void 0 : _a[1], code: (_b = s.match(/url:\s?"(.*?)"/)) === null || _b === void 0 ? void 0 : _b[1], dub: true }); }));
                    servers = raw
                        .filter(function (s) { return s.title && Object.keys(SOURCE_EXTRACTORS).some(function (key) { return s.title.includes(key); }) && s.code; })
                        .map(function (s) { return ({ name: s.title, url: s.code, dub: s.dub }); });
                    console.log("[AnimeAV1] HTML scraping OK: ".concat(servers.length, " servidores soportados"));
                    return [2 /*return*/, servers];
                case 7:
                    e_10 = _l.sent();
                    console.error("[AnimeAV1] Error en fallback HTML:", e_10.message);
                    return [2 /*return*/, []];
                case 8: return [2 /*return*/];
            }
        });
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
    var candidate = value.trim();
    if (!/^https?:\/\//i.test(candidate))
        return false;
    try {
        var parsed = new URL(candidate);
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
    return __awaiter(this, void 0, void 0, function () {
        var directUrl;
        return __generator(this, function (_a) {
            if (!isUsableHttpStreamUrlLocal(playUrl))
                throw Error('URL de HLS vacía o inválida');
            directUrl = playUrl.replace('/play/', '/m3u8/');
            if (!isUsableHttpStreamUrlLocal(directUrl))
                throw Error('URL de HLS sin identificador de reproducción');
            console.log("[HLS-zilla] URL construida: ".concat(directUrl));
            return [2 /*return*/, {
                    url: directUrl,
                    headers: {
                        "Referer": "https://player.zilla-networks.com/",
                        "Sec-Fetch-Site": "same-origin",
                        "Sec-Fetch-Mode": "cors",
                        "Sec-Fetch-Dest": "empty",
                        "User-Agent": UA
                    },
                    type: "hls"
                }];
        });
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
var VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];
function voeRot13(str) {
    return str.replace(/[a-zA-Z]/g, function (char) {
        var code = char.charCodeAt(0);
        var base = code <= 90 ? 65 : 97;
        return String.fromCharCode((code - base + 13) % 26 + base);
    });
}
function voeReplaceMarkers(str) {
    var e_13, _a;
    var out = str;
    try {
        for (var VOE_MARKERS_1 = __values(VOE_MARKERS), VOE_MARKERS_1_1 = VOE_MARKERS_1.next(); !VOE_MARKERS_1_1.done; VOE_MARKERS_1_1 = VOE_MARKERS_1.next()) {
            var marker = VOE_MARKERS_1_1.value;
            out = out.split(marker).join('_');
        }
    }
    catch (e_13_1) { e_13 = { error: e_13_1 }; }
    finally {
        try {
            if (VOE_MARKERS_1_1 && !VOE_MARKERS_1_1.done && (_a = VOE_MARKERS_1.return)) _a.call(VOE_MARKERS_1);
        }
        finally { if (e_13) throw e_13.error; }
    }
    return out;
}
function decodeVoePayload(rawValue) {
    var x = voeRot13(rawValue);
    x = voeReplaceMarkers(x);
    x = x.split('_').join('');
    x = atob(x);
    x = Array.from(x).map(function (c) { return String.fromCharCode((c.charCodeAt(0) - 3 + 256) % 256); }).join('');
    x = x.split('').reverse().join('');
    x = atob(x);
    return JSON.parse(x);
}
// extractVoe devuelve únicamente el manifest HLS reproducible de Voe.
function extractVoe(embedUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var resp, html, jsRedirect, redirectUrl, scriptMatch, jsonText, payloadArray, decoded, voeOrigin, hlsHeaders, sourceUrl;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch(embedUrl, {
                        headers: { "User-Agent": UA }
                    })];
                case 1:
                    resp = _a.sent();
                    if (!resp.ok)
                        throw Error("HTTP error! Status: ".concat(resp.status));
                    return [4 /*yield*/, resp.text()
                        // fetch() no ejecuta JavaScript, así que seguimos manualmente la redirección
                        // window.location.href que usa VOE.
                    ];
                case 2:
                    html = _a.sent();
                    jsRedirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
                    if (!jsRedirect) return [3 /*break*/, 5];
                    redirectUrl = jsRedirect[1];
                    console.log("[Voe] Redirecci\u00F3n JS detectada: ".concat(redirectUrl));
                    return [4 /*yield*/, fetch(redirectUrl, {
                            headers: { "User-Agent": UA }
                        })];
                case 3:
                    resp = _a.sent();
                    if (!resp.ok)
                        throw Error("HTTP error! Status: ".concat(resp.status));
                    return [4 /*yield*/, resp.text()];
                case 4:
                    html = _a.sent();
                    _a.label = 5;
                case 5:
                    scriptMatch = html.match(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
                    if (!scriptMatch)
                        throw Error("No se encontró el <script type=\"application/json\"> en el embed de Voe");
                    jsonText = scriptMatch[1]
                        .trim()
                        .replace(/&amp;/g, '&')
                        .replace(/&quot;/g, '"')
                        .replace(/&#34;/g, '"')
                        .replace(/&#39;/g, "'")
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>');
                    try {
                        payloadArray = JSON.parse(jsonText);
                    }
                    catch (e) {
                        throw Error("No se pudo parsear el array JSON del embed de Voe: ".concat(e.message));
                    }
                    if (!Array.isArray(payloadArray) || !payloadArray[0]) {
                        throw Error("El embed de Voe no trajo el payload esperado");
                    }
                    try {
                        decoded = decodeVoePayload(payloadArray[0]);
                    }
                    catch (e) {
                        throw Error("No se pudo decodificar el payload de Voe: ".concat(e.message));
                    }
                    voeOrigin = (function () { try {
                        return new URL(embedUrl).origin;
                    }
                    catch (_) {
                        return undefined;
                    } })();
                    hlsHeaders = {
                        "Referer": voeOrigin ? "".concat(voeOrigin, "/") : embedUrl,
                        "Sec-Fetch-Site": "same-origin",
                        "Sec-Fetch-Mode": "cors",
                        "Sec-Fetch-Dest": "empty",
                        "User-Agent": UA
                    };
                    sourceUrl = typeof decoded.source === 'string' ? decoded.source.trim() : '';
                    if (!isUsableHttpStreamUrlLocal(sourceUrl))
                        throw Error("El payload de Voe no trajo una URL HLS válida");
                    console.log("[Voe] HLS extra\u00EDdo: ".concat(sourceUrl));
                    return [2 /*return*/, {
                            url: sourceUrl,
                            headers: hlsHeaders,
                            type: "hls"
                        }];
            }
        });
    });
}
// Registro de sources activos: únicamente HLS directo de Zilla y HLS de Voe.
var ALL_SOURCES = {
    HLS: { label: "HLS", extract: extractZillaHLS },
    Voe: { label: "Voe HLS", extract: extractVoe }
};
try {
    for (var _b = __values(Object.entries(ALL_SOURCES)), _c = _b.next(); !_c.done; _c = _b.next()) {
        var _d = __read(_c.value, 2), key = _d[0], source = _d[1];
        if (ENABLED_SOURCES[key])
            SOURCE_EXTRACTORS[key] = source;
    }
}
catch (e_1_1) { e_1 = { error: e_1_1 }; }
finally {
    try {
        if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
    }
    finally { if (e_1) throw e_1.error; }
}
// ─────────────────────────────────────────────
// Entry point — contrato Nuvio
// ─────────────────────────────────────────────
var getLangLabel = function (dub) { return dub ? "🇲🇽 LATINO" : "🇯🇵 JAPONÉS · 🇲🇽 Sub"; };
/**
 * @param {string|number} tmdbId
 * @param {string} type - "movie" | "tv"
 * @param {string|number} [season]
 * @param {string|number} [episode]
 * @returns {Promise<Array>}
 */
function resolveAnimeAV1LocalLegacy(tmdbId, type, season, episode) {
    return __awaiter(this, void 0, void 0, function () {
        var seasonNum, _a, info, tmdbSeasonYear, reason, seasonYear, searchTerm, aniListInfo, candidates, matchInfo, aniListInfo, retryYear, retryTerm, retryMatch, e_14, match, epNumber, servers, sourceOrder_1, results, final, unique, e_15;
        var _this = this;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!tmdbId || !type)
                        return [2 /*return*/, []];
                    console.log("[AnimeAV1] Buscando: TMDB ".concat(tmdbId, " (").concat(type, ") S").concat(season !== null && season !== void 0 ? season : '-', "E").concat(episode !== null && episode !== void 0 ? episode : '-'));
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 15, , 16]);
                    seasonNum = type === "movie" ? 1 : (season ? Number(season) : 1);
                    return [4 /*yield*/, Promise.all([
                            getTMDBInfo(tmdbId, type),
                            // Para películas no existe temporada en TMDB — evitamos la llamada de más.
                            type === "movie" ? Promise.resolve(undefined) : getSeasonYear(tmdbId, seasonNum)
                        ])];
                case 2:
                    _a = __read.apply(void 0, [_c.sent(), 2]), info = _a[0], tmdbSeasonYear = _a[1];
                    if (!info)
                        return [2 /*return*/, []];
                    if (!looksLikeAnime(info)) {
                        reason = !looksLikeAsianOrigin(info.originCountries)
                            ? "origen no asi\u00E1tico (".concat(info.originCountries.join(', ') || 'desconocido', ")")
                            : "sin g\u00E9nero Animation";
                        console.log("[AnimeAV1] Descartado (".concat(reason, "), omitiendo b\u00FAsqueda: \"").concat(info.title, "\""));
                        return [2 /*return*/, []];
                    }
                    seasonYear = type === "movie" ? info.year : tmdbSeasonYear;
                    searchTerm = seasonNum !== 1 ? "".concat(info.title, " ").concat(seasonNum) : info.title;
                    if (!(seasonYear === undefined && type !== "movie")) return [3 /*break*/, 4];
                    console.warn("[AnimeAV1] TMDB sin a\u00F1o para temporada ".concat(seasonNum, ", probando AniList"));
                    return [4 /*yield*/, getAniListInfo(info.title, seasonNum)];
                case 3:
                    aniListInfo = _c.sent();
                    if (aniListInfo) {
                        seasonYear = aniListInfo.year;
                        searchTerm = aniListInfo.romajiTitle;
                    }
                    _c.label = 4;
                case 4:
                    console.log("[AnimeAV1] searchTerm=\"".concat(searchTerm, "\" year=").concat(seasonYear !== null && seasonYear !== void 0 ? seasonYear : 'ninguno'));
                    return [4 /*yield*/, searchAnimeAV1(searchTerm, seasonYear, seasonNum)];
                case 5:
                    candidates = _c.sent();
                    matchInfo = pickBestMatch(candidates, searchTerm, seasonNum);
                    if (!(!(matchInfo === null || matchInfo === void 0 ? void 0 : matchInfo.accepted) && type !== "movie")) return [3 /*break*/, 10];
                    console.warn("[AnimeAV1] Matching ambiguo para \"".concat(searchTerm, "\"; probando t\u00EDtulo romaji de AniList"));
                    return [4 /*yield*/, getAniListInfo(info.title, seasonNum)];
                case 6:
                    aniListInfo = _c.sent();
                    if (!(aniListInfo && (aniListInfo.romajiTitle !== searchTerm || aniListInfo.year !== seasonYear))) return [3 /*break*/, 10];
                    retryYear = (_b = aniListInfo.year) !== null && _b !== void 0 ? _b : seasonYear;
                    retryTerm = aniListInfo.romajiTitle;
                    _c.label = 7;
                case 7:
                    _c.trys.push([7, 9, , 10]);
                    return [4 /*yield*/, searchAnimeAV1(retryTerm, retryYear, seasonNum)];
                case 8:
                    candidates = _c.sent();
                    retryMatch = pickBestMatch(candidates, retryTerm, seasonNum);
                    if ((retryMatch === null || retryMatch === void 0 ? void 0 : retryMatch.accepted) || !(matchInfo === null || matchInfo === void 0 ? void 0 : matchInfo.accepted)) {
                        matchInfo = retryMatch;
                        seasonYear = retryYear;
                        searchTerm = retryTerm;
                    }
                    return [3 /*break*/, 10];
                case 9:
                    e_14 = _c.sent();
                    console.warn("[AnimeAV1] Segunda b\u00FAsqueda AniList fall\u00F3: ".concat(e_14.message));
                    return [3 /*break*/, 10];
                case 10:
                    if (!(matchInfo === null || matchInfo === void 0 ? void 0 : matchInfo.accepted)) {
                        console.warn("[AnimeAV1] No hay una coincidencia suficientemente segura para \"".concat(searchTerm, "\"; no se usar\u00E1 el primer resultado"));
                        return [2 /*return*/, []];
                    }
                    match = matchInfo.candidate;
                    console.log("[AnimeAV1] Match elegido: \"".concat(match.title, "\" (").concat(match.slug, ") score=").concat(matchInfo.score.toFixed(1)));
                    epNumber = type === "movie" ? 1 : (episode !== undefined ? Number(episode) : 1);
                    return [4 /*yield*/, getEpisodeServers(match.slug, epNumber)
                        // Fallback película: algunas están indexadas como episodio 0
                    ];
                case 11:
                    servers = _c.sent();
                    if (!(servers.length === 0 && type === "movie" && epNumber === 1)) return [3 /*break*/, 13];
                    console.warn("[AnimeAV1] Reintentando pel\u00EDcula con episodio 0");
                    return [4 /*yield*/, getEpisodeServers(match.slug, 0)];
                case 12:
                    servers = _c.sent();
                    _c.label = 13;
                case 13:
                    if (servers.length === 0) {
                        console.warn("[AnimeAV1] Sin servidores soportados para \"".concat(match.title, "\""));
                        return [2 /*return*/, []];
                    }
                    sourceOrder_1 = Object.keys(SOURCE_EXTRACTORS);
                    servers = __spreadArray([], __read(servers), false).sort(function (a, b) {
                        var aIdx = sourceOrder_1.findIndex(function (key) { return a.name.includes(key); });
                        var bIdx = sourceOrder_1.findIndex(function (key) { return b.name.includes(key); });
                        if (aIdx !== bIdx)
                            return aIdx - bIdx;
                        return (a.dub ? 1 : 0) - (b.dub ? 1 : 0); // false (SUB) antes que true (DUB)
                    });
                    return [4 /*yield*/, Promise.all(servers.map(function (server) { return __awaiter(_this, void 0, void 0, function () {
                            var sourceKey, source, resolved, variantsList, e_16;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        sourceKey = Object.keys(SOURCE_EXTRACTORS).find(function (key) { return server.name.includes(key); });
                                        source = sourceKey ? SOURCE_EXTRACTORS[sourceKey] : null;
                                        if (!source)
                                            return [2 /*return*/, null];
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, , 4]);
                                        return [4 /*yield*/, source.extract(server.url)
                                            // Los extractores devuelven un objeto HLS reproducible; se normaliza a array
                                            // para mantener el flujo común de procesamiento.
                                        ];
                                    case 2:
                                        resolved = _a.sent();
                                        variantsList = Array.isArray(resolved) ? resolved : [resolved];
                                        return [2 /*return*/, variantsList.map(function (variant) {
                                                var sourceLabel = sourceKey === 'Voe' ? 'Voe 720p' : source.label;
                                                var resolution = sourceKey === 'Voe' ? '720p' : '1080p';
                                                var label = "\uD83D\uDCFA ".concat(sourceLabel, "\n").concat(resolution, " | WEB-DL | Anime\n").concat(getLangLabel(server.dub));
                                                return __assign({ name: "AnimeAV1", title: "", url: variant.url, quality: label, headers: variant.headers }, (variant.type ? { type: variant.type } : {}));
                                            })];
                                    case 3:
                                        e_16 = _a.sent();
                                        console.warn("[".concat(source.label, "] Fall\u00F3 resolviendo un servidor: ").concat(e_16.message));
                                        return [2 /*return*/, null];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 14:
                    results = _c.sent();
                    final = results.filter(Boolean).flat();
                    unique = __spreadArray([], __read(new Map(final.map(function (stream) { return ["".concat(stream.url, "|").concat(stream.quality), stream]; })).values()), false);
                    console.log("[AnimeAV1] \u2713 ".concat(unique.length, " streams devueltos"));
                    return [2 /*return*/, unique];
                case 15:
                    e_15 = _c.sent();
                    console.error("[AnimeAV1] Error: ".concat(e_15.message));
                    return [2 /*return*/, []];
                case 16: return [2 /*return*/];
            }
        });
    });
}
// ─────────────────────────────────────────────
// Resolver remoto principal + resolución local completa de respaldo (1.2.11)
// ─────────────────────────────────────────────
var ANIMEAV1_RESOLVER_URL = "https://mh0ri3dvat.apps.bot-hosting.cloud";
var RESOLVER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
var LOCAL_RESOLVER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
var RESOLVER_CACHE_MAX_ENTRIES = 500;
var RESOLVER_TIMEOUT_MS = 12000;
var animeAV1RemoteCache = new Map();
var animeAV1LocalCache = new Map();
// Estas respuestas significan que el resolver terminó correctamente y decidió
// que no corresponde devolver un slug. En esos casos NO se debe repetir la
// búsqueda por el camino local, porque puede aceptar un falso positivo.
var REMOTE_DEFINITIVE_NEGATIVE_REASONS = new Set([
    'no_confident_match',
    'not_anime',
    'tmdb_not_found'
]);
// Errores de entrada/configuración que no se arreglan repitiendo la resolución
// con el algoritmo local. Los fallos técnicos y las respuestas desconocidas sí
// permiten el fallback para conservar la disponibilidad.
var REMOTE_INVALID_REQUEST_REASONS = new Set([
    'invalid_request',
    'invalid_parameters',
    'missing_tmdb_id',
    'tmdb_id_required',
    'invalid_type',
    'unsupported_type'
]);
function createRemoteResolverError(message, _a) {
    var _b = _a === void 0 ? {} : _a, _c = _b.fallbackAllowed, fallbackAllowed = _c === void 0 ? true : _c, _d = _b.reason, reason = _d === void 0 ? 'remote_error' : _d;
    var error = Error(message);
    error.code = 'ANIMEAV1_REMOTE_RESOLVER_ERROR';
    error.fallbackAllowed = fallbackAllowed;
    error.reason = reason;
    return error;
}
function getRemoteNegativeReason(data) {
    return typeof (data === null || data === void 0 ? void 0 : data.reason) === 'string' ? data.reason.trim().toLowerCase() : '';
}
function maintainResolverCache(cache, ttlMs, now) {
    var e_17, _a;
    if (now === void 0) { now = Date.now(); }
    try {
        for (var cache_1 = __values(cache), cache_1_1 = cache_1.next(); !cache_1_1.done; cache_1_1 = cache_1.next()) {
            var _b = __read(cache_1_1.value, 2), key = _b[0], entry = _b[1];
            if (!(entry === null || entry === void 0 ? void 0 : entry.timestamp) || now - entry.timestamp >= ttlMs)
                cache.delete(key);
        }
    }
    catch (e_17_1) { e_17 = { error: e_17_1 }; }
    finally {
        try {
            if (cache_1_1 && !cache_1_1.done && (_a = cache_1.return)) _a.call(cache_1);
        }
        finally { if (e_17) throw e_17.error; }
    }
    while (cache.size >= RESOLVER_CACHE_MAX_ENTRIES) {
        var oldestKey = cache.keys().next().value;
        if (oldestKey === undefined)
            break;
        cache.delete(oldestKey);
    }
}
function fetchWithTimeoutLocal(url_1) {
    return __awaiter(this, arguments, void 0, function (url, timeoutMs) {
        var controller, timer, timeout, request;
        if (timeoutMs === void 0) { timeoutMs = RESOLVER_TIMEOUT_MS; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    try {
                        if (typeof AbortController !== 'undefined')
                            controller = new AbortController();
                    }
                    catch (_) { }
                    timeout = new Promise(function (_, reject) {
                        timer = setTimeout(function () {
                            try {
                                controller === null || controller === void 0 ? void 0 : controller.abort();
                            }
                            catch (_) { }
                            reject(Error("Timeout de ".concat(timeoutMs, " ms")));
                        }, timeoutMs);
                    });
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, , 3, 4]);
                    request = fetch(url, controller ? { signal: controller.signal } : undefined);
                    return [4 /*yield*/, Promise.race([request, timeout])];
                case 2: return [2 /*return*/, _a.sent()];
                case 3:
                    clearTimeout(timer);
                    return [7 /*endfinally*/];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function resolverCacheKey(tmdbId, type, seasonNum) {
    return "".concat(tmdbId, "|").concat(type, "|").concat(seasonNum);
}
function getRemoteAnimeIdentity(tmdbId, type, seasonNum) {
    return __awaiter(this, void 0, void 0, function () {
        var key, cached, url, response, errorData, _1, reason_1, data, error_1, reason, identity;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    key = resolverCacheKey(tmdbId, type, seasonNum);
                    cached = animeAV1RemoteCache.get(key);
                    if (cached && Date.now() - cached.timestamp < RESOLVER_CACHE_TTL_MS) {
                        animeAV1RemoteCache.delete(key);
                        animeAV1RemoteCache.set(key, cached);
                        console.log("[AnimeAV1] Cach\u00E9 del resolver remoto: ".concat(cached.slug));
                        return [2 /*return*/, cached];
                    }
                    if (cached)
                        animeAV1RemoteCache.delete(key);
                    url = "".concat(ANIMEAV1_RESOLVER_URL, "/resolve?tmdbId=").concat(encodeURIComponent(tmdbId), "&type=").concat(encodeURIComponent(type), "&season=").concat(encodeURIComponent(seasonNum));
                    console.log("[AnimeAV1] Resolver remoto: ".concat(url));
                    return [4 /*yield*/, fetchWithTimeoutLocal(url)];
                case 1:
                    response = _b.sent();
                    if (!!response.ok) return [3 /*break*/, 6];
                    errorData = null;
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, response.json()];
                case 3:
                    errorData = _b.sent();
                    return [3 /*break*/, 5];
                case 4:
                    _1 = _b.sent();
                    return [3 /*break*/, 5];
                case 5:
                    reason_1 = getRemoteNegativeReason(errorData);
                    if (REMOTE_DEFINITIVE_NEGATIVE_REASONS.has(reason_1)) {
                        throw createRemoteResolverError("Resolver remoto: ".concat(reason_1).concat((errorData === null || errorData === void 0 ? void 0 : errorData.tmdbTitle) ? " (".concat(errorData.tmdbTitle, ")") : ''), { fallbackAllowed: false, reason: reason_1 });
                    }
                    if (REMOTE_INVALID_REQUEST_REASONS.has(reason_1) || response.status === 400 || response.status === 422) {
                        throw createRemoteResolverError("Solicitud rechazada por el resolver remoto HTTP ".concat(response.status).concat(reason_1 ? " (".concat(reason_1, ")") : ''), { fallbackAllowed: false, reason: reason_1 || "http_".concat(response.status) });
                    }
                    // Timeout (408), límite de peticiones (429), errores de servidor (5xx),
                    // endpoint temporalmente inaccesible y otros fallos de transporte permiten
                    // fallback. La API remota no confirmó que el título no fuera anime.
                    throw createRemoteResolverError("Resolver remoto HTTP ".concat(response.status), {
                        fallbackAllowed: true,
                        reason: reason_1 || "http_".concat(response.status)
                    });
                case 6:
                    _b.trys.push([6, 8, , 9]);
                    return [4 /*yield*/, response.json()];
                case 7:
                    data = _b.sent();
                    return [3 /*break*/, 9];
                case 8:
                    error_1 = _b.sent();
                    throw createRemoteResolverError("Respuesta JSON inv\u00E1lida del resolver remoto: ".concat(error_1.message), {
                        fallbackAllowed: true,
                        reason: 'invalid_json'
                    });
                case 9:
                    reason = getRemoteNegativeReason(data);
                    if ((data === null || data === void 0 ? void 0 : data.success) === false && REMOTE_DEFINITIVE_NEGATIVE_REASONS.has(reason)) {
                        throw createRemoteResolverError("Resolver remoto: ".concat(reason).concat((data === null || data === void 0 ? void 0 : data.tmdbTitle) ? " (".concat(data.tmdbTitle, ")") : ''), { fallbackAllowed: false, reason: reason });
                    }
                    if ((data === null || data === void 0 ? void 0 : data.success) === false && REMOTE_INVALID_REQUEST_REASONS.has(reason)) {
                        throw createRemoteResolverError("Solicitud rechazada por el resolver remoto: ".concat(reason), {
                            fallbackAllowed: false,
                            reason: reason
                        });
                    }
                    if (!data || data.success !== true || typeof data.slug !== 'string' || !data.slug.trim()) {
                        // success:false desconocido puede representar una API auxiliar caída. No
                        // tratarlo como una negativa definitiva: permitir recuperación local.
                        throw createRemoteResolverError((data === null || data === void 0 ? void 0 : data.error) || "El resolver remoto no devolvi\u00F3 un slug v\u00E1lido".concat(reason ? " (reason=".concat(reason, ")") : ''), {
                            fallbackAllowed: true,
                            reason: reason || 'incomplete_response'
                        });
                    }
                    identity = {
                        slug: data.slug.trim(),
                        title: data.animeav1Title || '',
                        score: typeof data.score === 'number' ? data.score : undefined,
                        matchType: data.matchType || 'remote',
                        timestamp: Date.now()
                    };
                    maintainResolverCache(animeAV1RemoteCache, RESOLVER_CACHE_TTL_MS);
                    animeAV1RemoteCache.set(key, identity);
                    console.log("[AnimeAV1] Resolver remoto encontr\u00F3 \"".concat(identity.title || identity.slug, "\" slug=").concat(identity.slug, " score=").concat((_a = identity.score) !== null && _a !== void 0 ? _a : '?', " tipo=").concat(identity.matchType));
                    return [2 /*return*/, identity];
            }
        });
    });
}
function getTMDBSeasonInfoLocal(tmdbId, seasonNum) {
    return __awaiter(this, void 0, void 0, function () {
        var url, response, data, airDate, e_18;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    url = "https://api.themoviedb.org/3/tv/".concat(tmdbId, "/season/").concat(seasonNum, "?api_key=").concat(TMDB_API_KEY, "&language=en-US");
                    return [4 /*yield*/, fetch(url, { headers: { 'User-Agent': UA } })];
                case 1:
                    response = _a.sent();
                    if (!response.ok)
                        throw Error("HTTP ".concat(response.status));
                    return [4 /*yield*/, response.json()];
                case 2:
                    data = _a.sent();
                    airDate = (data === null || data === void 0 ? void 0 : data.air_date) || '';
                    return [2 /*return*/, {
                            year: airDate ? new Date(airDate).getFullYear() : undefined,
                            name: (data === null || data === void 0 ? void 0 : data.name) || (data === null || data === void 0 ? void 0 : data.original_name) || '',
                            airDate: airDate
                        }];
                case 3:
                    e_18 = _a.sent();
                    console.warn("[TMDB] Datos de temporada no disponibles para S".concat(seasonNum, ": ").concat(e_18.message));
                    return [2 /*return*/, { year: undefined, name: '', airDate: '' }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function getTMDBAlternativeTitlesLocal(tmdbId, type) {
    return __awaiter(this, void 0, void 0, function () {
        var path, url, response, data, rows, countries_1, e_19;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    path = type === 'movie' ? 'movie' : 'tv';
                    url = "https://api.themoviedb.org/3/".concat(path, "/").concat(tmdbId, "/alternative_titles?api_key=").concat(TMDB_API_KEY);
                    return [4 /*yield*/, fetch(url, { headers: { 'User-Agent': UA } })];
                case 1:
                    response = _a.sent();
                    if (!response.ok)
                        throw Error("HTTP ".concat(response.status));
                    return [4 /*yield*/, response.json()];
                case 2:
                    data = _a.sent();
                    rows = type === 'movie' ? data === null || data === void 0 ? void 0 : data.titles : data === null || data === void 0 ? void 0 : data.results;
                    if (!Array.isArray(rows))
                        return [2 /*return*/, []];
                    countries_1 = new Set(['US', 'JP', 'KR', 'CN', 'TW', 'HK']);
                    return [2 /*return*/, uniqueLocalTitles(rows
                            .filter(function (row) { return row && typeof row.title === 'string' && row.title.trim().length >= 3 && (!row.iso_3166_1 || countries_1.has(row.iso_3166_1)); })
                            .map(function (row) { return row.title; }), 8)];
                case 3:
                    e_19 = _a.sent();
                    console.warn("[TMDB] T\u00EDtulos alternativos no disponibles: ".concat(e_19.message));
                    return [2 /*return*/, []];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function uniqueLocalTitles(values, maxCount) {
    var e_20, _a;
    if (maxCount === void 0) { maxCount = 20; }
    var result = [];
    var seen = new Set();
    try {
        for (var _b = __values(values || []), _c = _b.next(); !_c.done; _c = _b.next()) {
            var value = _c.value;
            var raw = String(value || '').trim();
            var key = normalizeTitle(raw);
            if (!key || key.length < 3 || seen.has(key))
                continue;
            if (/^(?:season\s*\d+|\d+(?:st|nd|rd|th)?\s+season|part\s*\d+)$/.test(key))
                continue;
            seen.add(key);
            result.push(raw);
            if (result.length >= maxCount)
                break;
        }
    }
    catch (e_20_1) { e_20 = { error: e_20_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_20) throw e_20.error; }
    }
    return result;
}
function fetchAniListCandidatesLocal(title) {
    return __awaiter(this, void 0, void 0, function () {
        var query, response, json, rows;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    query = "query ($search: String) {\n    Page(page: 1, perPage: 25) {\n      media(search: $search, type: ANIME, sort: SEARCH_MATCH) {\n        id\n        title { romaji english native }\n        synonyms\n        seasonYear\n        startDate { year month day }\n        format\n      }\n    }\n  }";
                    return [4 /*yield*/, fetch('https://graphql.anilist.co', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            body: JSON.stringify({ query: query, variables: { search: title } })
                        })];
                case 1:
                    response = _d.sent();
                    if (!response.ok)
                        throw Error("AniList HTTP ".concat(response.status));
                    return [4 /*yield*/, response.json()];
                case 2:
                    json = _d.sent();
                    if (Array.isArray(json === null || json === void 0 ? void 0 : json.errors) && json.errors.length)
                        throw Error("AniList GraphQL: ".concat(((_a = json.errors[0]) === null || _a === void 0 ? void 0 : _a.message) || 'error desconocido'));
                    rows = (_c = (_b = json === null || json === void 0 ? void 0 : json.data) === null || _b === void 0 ? void 0 : _b.Page) === null || _c === void 0 ? void 0 : _c.media;
                    return [2 /*return*/, Array.isArray(rows) ? rows : []];
            }
        });
    });
}
function ordinalSeasonLabelLocal(seasonNum) {
    var n = Math.max(1, Number(seasonNum) || 1);
    var mod100 = n % 100;
    var suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
    return "".concat(n).concat(suffix, " Season");
}
function explicitSeasonForMediaLocal(media, targetSeason) {
    var title = (media === null || media === void 0 ? void 0 : media.title) || {};
    var values = __spreadArray([title.romaji, title.english, title.native], __read((Array.isArray(media === null || media === void 0 ? void 0 : media.synonyms) ? media.synonyms : [])), false);
    var seasons = values.map(getExplicitSeason).filter(Number.isInteger);
    if (targetSeason > 1 && seasons.includes(targetSeason))
        return targetSeason;
    return seasons[0];
}
function uniqueTitleRecordsLocal(values, maxCount) {
    var e_21, _a;
    if (maxCount === void 0) { maxCount = 20; }
    var result = [];
    var seen = new Map();
    try {
        for (var _b = __values(values || []), _c = _b.next(); !_c.done; _c = _b.next()) {
            var item = _c.value;
            var term = String(typeof item === 'string' ? item : (item === null || item === void 0 ? void 0 : item.term) || '').trim();
            var origin = typeof item === 'string' ? 'tmdb' : ((item === null || item === void 0 ? void 0 : item.origin) || 'tmdb');
            var key = normalizeTitle(term);
            if (!key || key.length < 3)
                continue;
            if (/^(?:season\s*\d+|\d+(?:st|nd|rd|th)?\s+season|part\s*\d+)$/.test(key))
                continue;
            if (seen.has(key)) {
                var index = seen.get(key);
                if ((item === null || item === void 0 ? void 0 : item.seasonIdentity) && !result[index].seasonIdentity) {
                    result[index] = __assign(__assign({}, result[index]), { seasonIdentity: true, targetSeason: item.targetSeason });
                }
                continue;
            }
            seen.set(key, result.length);
            result.push(__assign({ term: term, origin: origin }, ((item === null || item === void 0 ? void 0 : item.seasonIdentity) ? { seasonIdentity: true, targetSeason: item.targetSeason } : {})));
            if (result.length >= maxCount)
                break;
        }
    }
    catch (e_21_1) { e_21 = { error: e_21_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_21) throw e_21.error; }
    }
    return result;
}
function scoreAniListCandidateLocal(media, sourceTitles, baseTitles, targetYear, seasonNum) {
    var e_22, _a, e_23, _b;
    var _c;
    var title = (media === null || media === void 0 ? void 0 : media.title) || {};
    var named = __spreadArray([
        { value: title.romaji || '', synonym: false },
        { value: title.english || '', synonym: false },
        { value: title.native || '', synonym: false }
    ], __read((Array.isArray(media === null || media === void 0 ? void 0 : media.synonyms) ? media.synonyms.map(function (value) { return ({ value: value || '', synonym: true }); }) : [])), false);
    var titleScore = 0;
    var matchType = 'title-similarity';
    try {
        for (var sourceTitles_1 = __values(sourceTitles), sourceTitles_1_1 = sourceTitles_1.next(); !sourceTitles_1_1.done; sourceTitles_1_1 = sourceTitles_1.next()) {
            var sourceTitle = sourceTitles_1_1.value;
            var target = normalizeTitle(sourceTitle);
            if (!target)
                continue;
            var targetTokens = new Set(titleTokens(sourceTitle));
            var _loop_1 = function (name) {
                var candidate = normalizeTitle(name.value);
                if (!candidate)
                    return "continue";
                var score = 0;
                if (candidate === target)
                    score = name.synonym ? 130 : 120;
                else if (target.length >= 5 && candidate.length >= 5 && (candidate.includes(target) || target.includes(candidate))) {
                    score = 82 + (Math.min(target.length, candidate.length) / Math.max(target.length, candidate.length)) * 12;
                }
                else {
                    var candidateTokens_1 = new Set(titleTokens(name.value));
                    if (!targetTokens.size || !candidateTokens_1.size)
                        return "continue";
                    var overlap_1 = 0;
                    targetTokens.forEach(function (token) { if (candidateTokens_1.has(token))
                        overlap_1++; });
                    var coverage = overlap_1 / targetTokens.size;
                    var precision = overlap_1 / candidateTokens_1.size;
                    var symmetric = overlap_1 ? 2 * overlap_1 / (targetTokens.size + candidateTokens_1.size) : 0;
                    score = Math.max(coverage * 58 + precision * 12, symmetric * 78);
                }
                if (score > titleScore) {
                    titleScore = score;
                    matchType = name.synonym && score >= 120 ? 'anilist-synonym' : (score >= 120 ? 'anilist-title' : 'title-similarity');
                }
            };
            try {
                for (var named_1 = (e_23 = void 0, __values(named)), named_1_1 = named_1.next(); !named_1_1.done; named_1_1 = named_1.next()) {
                    var name = named_1_1.value;
                    _loop_1(name);
                }
            }
            catch (e_23_1) { e_23 = { error: e_23_1 }; }
            finally {
                try {
                    if (named_1_1 && !named_1_1.done && (_b = named_1.return)) _b.call(named_1);
                }
                finally { if (e_23) throw e_23.error; }
            }
        }
    }
    catch (e_22_1) { e_22 = { error: e_22_1 }; }
    finally {
        try {
            if (sourceTitles_1_1 && !sourceTitles_1_1.done && (_a = sourceTitles_1.return)) _a.call(sourceTitles_1);
        }
        finally { if (e_22) throw e_22.error; }
    }
    var year = Number((media === null || media === void 0 ? void 0 : media.seasonYear) || ((_c = media === null || media === void 0 ? void 0 : media.startDate) === null || _c === void 0 ? void 0 : _c.year)) || undefined;
    var yearBonus = 0;
    if (targetYear && year) {
        var diff = Math.abs(year - targetYear);
        if (diff === 0)
            yearBonus = 36;
        else if (diff === 1)
            yearBonus = 12;
        else if (diff === 2)
            yearBonus = 2;
        else
            yearBonus = -Math.min(45, (diff - 2) * 8);
    }
    var explicitSeason = explicitSeasonForMediaLocal(media, seasonNum);
    var baseSimilarity = Math.max.apply(Math, __spreadArray([0], __read(baseTitles.map(function (sourceTitle) {
        return Math.max.apply(Math, __spreadArray([0], __read(named.map(function (name) { return wordSimilarity(sourceTitle, name.value); })), false));
    })), false));
    var seasonBonus = 0;
    if (seasonNum > 1) {
        if (explicitSeason === seasonNum)
            seasonBonus = 220;
        else if (explicitSeason !== undefined)
            seasonBonus = -220;
        if ((media === null || media === void 0 ? void 0 : media.format) && media.format !== 'TV')
            seasonBonus -= 100;
    }
    return { media: media, year: year, titleScore: titleScore, score: titleScore + yearBonus + seasonBonus + baseSimilarity * 30, matchType: matchType, explicitSeason: explicitSeason, baseSimilarity: baseSimilarity };
}
function fetchAniListMediaRelationsLocal(mediaId) {
    return __awaiter(this, void 0, void 0, function () {
        var query, response, json;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    query = "query ($id: Int) {\n    Media(id: $id, type: ANIME) {\n      id\n      relations {\n        edges {\n          relationType\n          node {\n            id\n            idMal\n            type\n            format\n            title { romaji english native }\n            synonyms\n            seasonYear\n            startDate { year month day }\n          }\n        }\n      }\n    }\n  }";
                    return [4 /*yield*/, fetch('https://graphql.anilist.co', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            body: JSON.stringify({ query: query, variables: { id: Number(mediaId) } })
                        })];
                case 1:
                    response = _c.sent();
                    if (!response.ok)
                        throw Error("AniList relaciones HTTP ".concat(response.status));
                    return [4 /*yield*/, response.json()];
                case 2:
                    json = _c.sent();
                    if (Array.isArray(json === null || json === void 0 ? void 0 : json.errors) && json.errors.length)
                        throw Error("AniList GraphQL: ".concat(((_a = json.errors[0]) === null || _a === void 0 ? void 0 : _a.message) || 'error desconocido'));
                    return [2 /*return*/, ((_b = json === null || json === void 0 ? void 0 : json.data) === null || _b === void 0 ? void 0 : _b.Media) || undefined];
            }
        });
    });
}
function mediaMatchesBaseSeriesLocal(media, baseTitles) {
    var title = (media === null || media === void 0 ? void 0 : media.title) || {};
    var names = __spreadArray([title.romaji, title.english, title.native], __read(((media === null || media === void 0 ? void 0 : media.synonyms) || [])), false).filter(Boolean);
    var normalizedBases = new Set(baseTitles.map(normalizeTitle).filter(Boolean));
    if (names.some(function (name) { return normalizedBases.has(normalizeTitle(name)); }))
        return true;
    return names.some(function (name) { return baseTitles.some(function (base) {
        return wordSimilarity(base, name) >= 0.95 && wordSimilarity(name, base) >= 0.75;
    }); });
}
function verifyAniListSeasonViaRelationsLocal(mediaId_1, expectedSeason_1, baseTitles_1) {
    return __awaiter(this, arguments, void 0, function (mediaId, expectedSeason, baseTitles, visited, depth) {
        var media, edges, tvPrequels, tvPrequels_1, tvPrequels_1_1, prequel, previousSeason, _a, e_24_1;
        var e_24, _b;
        var _c;
        if (visited === void 0) { visited = new Set(); }
        if (depth === void 0) { depth = 0; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    if (!mediaId || expectedSeason < 2 || depth > 8 || visited.has(Number(mediaId)))
                        return [2 /*return*/, false];
                    visited.add(Number(mediaId));
                    return [4 /*yield*/, fetchAniListMediaRelationsLocal(mediaId)];
                case 1:
                    media = _d.sent();
                    edges = (_c = media === null || media === void 0 ? void 0 : media.relations) === null || _c === void 0 ? void 0 : _c.edges;
                    if (!Array.isArray(edges))
                        return [2 /*return*/, false];
                    tvPrequels = edges
                        .filter(function (edge) { var _a, _b; return (edge === null || edge === void 0 ? void 0 : edge.relationType) === 'PREQUEL' && ((_a = edge === null || edge === void 0 ? void 0 : edge.node) === null || _a === void 0 ? void 0 : _a.type) === 'ANIME' && ((_b = edge === null || edge === void 0 ? void 0 : edge.node) === null || _b === void 0 ? void 0 : _b.format) === 'TV'; })
                        .map(function (edge) { return edge.node; });
                    _d.label = 2;
                case 2:
                    _d.trys.push([2, 8, 9, 10]);
                    tvPrequels_1 = __values(tvPrequels), tvPrequels_1_1 = tvPrequels_1.next();
                    _d.label = 3;
                case 3:
                    if (!!tvPrequels_1_1.done) return [3 /*break*/, 7];
                    prequel = tvPrequels_1_1.value;
                    if (expectedSeason === 2 && mediaMatchesBaseSeriesLocal(prequel, baseTitles))
                        return [2 /*return*/, true];
                    previousSeason = explicitSeasonForMediaLocal(prequel, expectedSeason - 1);
                    if (previousSeason === expectedSeason - 1)
                        return [2 /*return*/, true];
                    if (previousSeason !== undefined)
                        return [3 /*break*/, 6];
                    _a = expectedSeason > 2 && prequel.id;
                    if (!_a) return [3 /*break*/, 5];
                    return [4 /*yield*/, verifyAniListSeasonViaRelationsLocal(prequel.id, expectedSeason - 1, baseTitles, new Set(visited), depth + 1)];
                case 4:
                    _a = (_d.sent());
                    _d.label = 5;
                case 5:
                    if (_a)
                        return [2 /*return*/, true];
                    _d.label = 6;
                case 6:
                    tvPrequels_1_1 = tvPrequels_1.next();
                    return [3 /*break*/, 3];
                case 7: return [3 /*break*/, 10];
                case 8:
                    e_24_1 = _d.sent();
                    e_24 = { error: e_24_1 };
                    return [3 /*break*/, 10];
                case 9:
                    try {
                        if (tvPrequels_1_1 && !tvPrequels_1_1.done && (_b = tvPrequels_1.return)) _b.call(tvPrequels_1);
                    }
                    finally { if (e_24) throw e_24.error; }
                    return [7 /*endfinally*/];
                case 10: return [2 /*return*/, false];
            }
        });
    });
}
function resolveAniListIdentityLocal(info_1, seasonNum_1, targetYear_1) {
    return __awaiter(this, arguments, void 0, function (info, seasonNum, targetYear, extraTitles) {
        var baseTitles, specificExtras, ordinalQueries, all, seenIds, rejectedRelationIds, relationVerificationCache, verifyCandidateRelations, fetchOne, rankResults, selected, ordinalQueries_1, ordinalQueries_1_1, query, e_25_1, fallbackQueries, _a, _b, query, e_26_1, media, title, seasonVerified;
        var e_25, _c, e_26, _d;
        var _this = this;
        if (extraTitles === void 0) { extraTitles = []; }
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    baseTitles = uniqueLocalTitles([info === null || info === void 0 ? void 0 : info.title, info === null || info === void 0 ? void 0 : info.originalTitle], 4);
                    specificExtras = uniqueLocalTitles((extraTitles || []).filter(function (value) { return getExplicitSeason(value) === seasonNum; }), 3);
                    ordinalQueries = seasonNum > 1
                        ? uniqueLocalTitles(__spreadArray(__spreadArray(__spreadArray([], __read(specificExtras), false), __read(((info === null || info === void 0 ? void 0 : info.title) ? ["".concat(info.title, " ").concat(ordinalSeasonLabelLocal(seasonNum))] : [])), false), __read(((info === null || info === void 0 ? void 0 : info.originalTitle) ? ["".concat(info.originalTitle, " ").concat(ordinalSeasonLabelLocal(seasonNum))] : [])), false), 3)
                        : uniqueLocalTitles(__spreadArray(__spreadArray([], __read(baseTitles), false), __read((extraTitles || [])), false), 3);
                    if (!ordinalQueries.length && !baseTitles.length)
                        return [2 /*return*/, undefined];
                    all = [];
                    seenIds = new Set();
                    rejectedRelationIds = new Set();
                    relationVerificationCache = new Map();
                    verifyCandidateRelations = function (entry) { return __awaiter(_this, void 0, void 0, function () {
                        var id, verified, error_2;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    id = Number((_a = entry === null || entry === void 0 ? void 0 : entry.media) === null || _a === void 0 ? void 0 : _a.id);
                                    if (!id)
                                        return [2 /*return*/, false];
                                    if (relationVerificationCache.has(id))
                                        return [2 /*return*/, relationVerificationCache.get(id)];
                                    _b.label = 1;
                                case 1:
                                    _b.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, verifyAniListSeasonViaRelationsLocal(id, seasonNum, baseTitles)];
                                case 2:
                                    verified = _b.sent();
                                    relationVerificationCache.set(id, verified);
                                    if (!verified)
                                        rejectedRelationIds.add(id);
                                    return [2 /*return*/, verified];
                                case 3:
                                    error_2 = _b.sent();
                                    console.warn("[AniList] No se pudo validar relaci\u00F3n del candidato ".concat(id, ": ").concat(error_2.message));
                                    relationVerificationCache.set(id, false);
                                    rejectedRelationIds.add(id);
                                    return [2 /*return*/, false];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); };
                    fetchOne = function (query) { return __awaiter(_this, void 0, void 0, function () {
                        var rows, error_3, rows_2, rows_2_1, row;
                        var e_27, _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    rows = [];
                                    _b.label = 1;
                                case 1:
                                    _b.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, fetchAniListCandidatesLocal(query)];
                                case 2:
                                    rows = _b.sent();
                                    return [3 /*break*/, 4];
                                case 3:
                                    error_3 = _b.sent();
                                    console.warn("[AniList] B\u00FAsqueda local \"".concat(query, "\" fall\u00F3: ").concat(error_3.message));
                                    return [3 /*break*/, 4];
                                case 4:
                                    try {
                                        for (rows_2 = __values(rows), rows_2_1 = rows_2.next(); !rows_2_1.done; rows_2_1 = rows_2.next()) {
                                            row = rows_2_1.value;
                                            if ((row === null || row === void 0 ? void 0 : row.id) == null || seenIds.has(row.id))
                                                continue;
                                            seenIds.add(row.id);
                                            all.push(row);
                                        }
                                    }
                                    catch (e_27_1) { e_27 = { error: e_27_1 }; }
                                    finally {
                                        try {
                                            if (rows_2_1 && !rows_2_1.done && (_a = rows_2.return)) _a.call(rows_2);
                                        }
                                        finally { if (e_27) throw e_27.error; }
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    }); };
                    rankResults = function () {
                        var _a;
                        var identityTitles = uniqueLocalTitles(__spreadArray([info === null || info === void 0 ? void 0 : info.title, info === null || info === void 0 ? void 0 : info.originalTitle], __read((extraTitles || [])), false), 12);
                        var scored = all.map(function (media) { return scoreAniListCandidateLocal(media, identityTitles, baseTitles, targetYear, seasonNum); });
                        if (seasonNum <= 1) {
                            var baseMatches = scored.filter(function (entry) { return entry.explicitSeason === undefined || entry.explicitSeason === 1; })
                                .sort(function (a, b) { return b.score - a.score || b.titleScore - a.titleScore; });
                            return ((_a = baseMatches[0]) === null || _a === void 0 ? void 0 : _a.titleScore) >= 52 ? baseMatches[0] : undefined;
                        }
                        var explicitMatches = scored.filter(function (entry) { var _a; return entry.explicitSeason === seasonNum && entry.baseSimilarity >= 0.45 && (!((_a = entry.media) === null || _a === void 0 ? void 0 : _a.format) || entry.media.format === 'TV'); });
                        if (explicitMatches.length) {
                            explicitMatches.sort(function (a, b) { return b.score - a.score || b.titleScore - a.titleScore; });
                            return __assign(__assign({}, explicitMatches[0]), { seasonProof: 'explicit-title' });
                        }
                        var baseNormalizedTitles = new Set([info === null || info === void 0 ? void 0 : info.title, info === null || info === void 0 ? void 0 : info.originalTitle].map(normalizeTitle).filter(Boolean));
                        var yearMatches = scored.filter(function (entry) {
                            var _a, _b, _c;
                            if (rejectedRelationIds.has(Number((_a = entry.media) === null || _a === void 0 ? void 0 : _a.id)))
                                return false;
                            var mediaTitle = ((_b = entry.media) === null || _b === void 0 ? void 0 : _b.title) || {};
                            var primary = normalizeTitle(mediaTitle.romaji || mediaTitle.english || '');
                            var hasTargetYear = targetYear ? entry.year === targetYear : Boolean(entry.year);
                            var distinctTitle = primary && !baseNormalizedTitles.has(primary);
                            return hasTargetYear && distinctTitle && entry.baseSimilarity >= 0.7 && entry.explicitSeason === undefined && (!((_c = entry.media) === null || _c === void 0 ? void 0 : _c.format) || entry.media.format === 'TV');
                        });
                        if (yearMatches.length) {
                            yearMatches.sort(function (a, b) { return b.score - a.score || b.titleScore - a.titleScore; });
                            return __assign(__assign({}, yearMatches[0]), { seasonProof: 'year-needs-relations' });
                        }
                        return undefined;
                    };
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 7, 8, 9]);
                    ordinalQueries_1 = __values(ordinalQueries), ordinalQueries_1_1 = ordinalQueries_1.next();
                    _e.label = 2;
                case 2:
                    if (!!ordinalQueries_1_1.done) return [3 /*break*/, 6];
                    query = ordinalQueries_1_1.value;
                    return [4 /*yield*/, fetchOne(query)];
                case 3:
                    _e.sent();
                    selected = rankResults();
                    if ((selected === null || selected === void 0 ? void 0 : selected.seasonProof) === 'explicit-title')
                        return [3 /*break*/, 6];
                    if (!((selected === null || selected === void 0 ? void 0 : selected.seasonProof) === 'year-needs-relations')) return [3 /*break*/, 5];
                    return [4 /*yield*/, verifyCandidateRelations(selected)];
                case 4:
                    if (_e.sent())
                        return [3 /*break*/, 6];
                    selected = rankResults();
                    _e.label = 5;
                case 5:
                    ordinalQueries_1_1 = ordinalQueries_1.next();
                    return [3 /*break*/, 2];
                case 6: return [3 /*break*/, 9];
                case 7:
                    e_25_1 = _e.sent();
                    e_25 = { error: e_25_1 };
                    return [3 /*break*/, 9];
                case 8:
                    try {
                        if (ordinalQueries_1_1 && !ordinalQueries_1_1.done && (_c = ordinalQueries_1.return)) _c.call(ordinalQueries_1);
                    }
                    finally { if (e_25) throw e_25.error; }
                    return [7 /*endfinally*/];
                case 9:
                    if (!(!selected && seasonNum > 1)) return [3 /*break*/, 18];
                    fallbackQueries = baseTitles.filter(function (title) { return !ordinalQueries.some(function (query) { return normalizeTitle(query) === normalizeTitle(title); }); });
                    _e.label = 10;
                case 10:
                    _e.trys.push([10, 16, 17, 18]);
                    _a = __values(fallbackQueries.slice(0, 2)), _b = _a.next();
                    _e.label = 11;
                case 11:
                    if (!!_b.done) return [3 /*break*/, 15];
                    query = _b.value;
                    return [4 /*yield*/, fetchOne(query)];
                case 12:
                    _e.sent();
                    selected = rankResults();
                    if ((selected === null || selected === void 0 ? void 0 : selected.seasonProof) === 'explicit-title')
                        return [3 /*break*/, 15];
                    if (!((selected === null || selected === void 0 ? void 0 : selected.seasonProof) === 'year-needs-relations')) return [3 /*break*/, 14];
                    return [4 /*yield*/, verifyCandidateRelations(selected)];
                case 13:
                    if (_e.sent())
                        return [3 /*break*/, 15];
                    selected = rankResults();
                    _e.label = 14;
                case 14:
                    _b = _a.next();
                    return [3 /*break*/, 11];
                case 15: return [3 /*break*/, 18];
                case 16:
                    e_26_1 = _e.sent();
                    e_26 = { error: e_26_1 };
                    return [3 /*break*/, 18];
                case 17:
                    try {
                        if (_b && !_b.done && (_d = _a.return)) _d.call(_a);
                    }
                    finally { if (e_26) throw e_26.error; }
                    return [7 /*endfinally*/];
                case 18:
                    if (!selected) {
                        console.warn("[AniList] No se identific\u00F3 con confianza la temporada ".concat(seasonNum, " de \"").concat(info.title, "\""));
                        return [2 /*return*/, undefined];
                    }
                    media = selected.media;
                    title = (media === null || media === void 0 ? void 0 : media.title) || {};
                    seasonVerified = seasonNum === 1 || selected.explicitSeason === seasonNum;
                    if (!(!seasonVerified && seasonNum > 1 && selected.seasonProof === 'year-needs-relations')) return [3 /*break*/, 20];
                    return [4 /*yield*/, verifyCandidateRelations(selected)];
                case 19:
                    seasonVerified = _e.sent();
                    _e.label = 20;
                case 20:
                    console.log("[AniList] Resolver local: \"".concat(title.romaji || title.english || '?', "\" id=").concat(media.id, " year=").concat(selected.year || targetYear || '?', " score=").concat(selected.score.toFixed(1), " seasonVerified=").concat(Boolean(seasonVerified), " proof=").concat(selected.seasonProof || 'legacy', " match=").concat(selected.matchType));
                    return [2 /*return*/, {
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
                            seasonNum: seasonNum
                        }];
            }
        });
    });
}
function extractAnimeAV1StreamsLocal(servers) {
    return __awaiter(this, void 0, void 0, function () {
        var sourceOrder, supported, groups, all, seen;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    sourceOrder = Object.keys(SOURCE_EXTRACTORS);
                    supported = servers.filter(function (server) { return sourceOrder.some(function (key) { return server.name.includes(key); }); });
                    supported.sort(function (a, b) {
                        var ai = sourceOrder.findIndex(function (key) { return a.name.includes(key); });
                        var bi = sourceOrder.findIndex(function (key) { return b.name.includes(key); });
                        if (ai !== bi)
                            return ai - bi;
                        return (a.dub ? 1 : 0) - (b.dub ? 1 : 0);
                    });
                    return [4 /*yield*/, Promise.all(supported.map(function (server) { return __awaiter(_this, void 0, void 0, function () {
                            var sourceKey, source, resolved, variants, e_28;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        sourceKey = Object.keys(SOURCE_EXTRACTORS).find(function (key) { return server.name.includes(key); });
                                        source = sourceKey ? SOURCE_EXTRACTORS[sourceKey] : null;
                                        if (!source)
                                            return [2 /*return*/, []];
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, , 4]);
                                        return [4 /*yield*/, source.extract(server.url)];
                                    case 2:
                                        resolved = _a.sent();
                                        variants = Array.isArray(resolved) ? resolved : [resolved];
                                        return [2 /*return*/, variants.filter(function (variant) { return isUsableHttpStreamUrlLocal(variant === null || variant === void 0 ? void 0 : variant.url); }).map(function (variant) { return (__assign({ name: 'AnimeAV1', title: '', url: variant.url.trim(), quality: "\uD83D\uDCFA ".concat(sourceKey === 'Voe' ? 'Voe 720p' : source.label, "\n").concat(sourceKey === 'Voe' ? '720p' : '1080p', " | WEB-DL | Anime\n").concat(getLangLabel(server.dub)), headers: variant.headers }, (variant.type ? { type: variant.type } : {}))); })];
                                    case 3:
                                        e_28 = _a.sent();
                                        console.warn("[".concat(source.label, "] Fall\u00F3 resolviendo un servidor: ").concat(e_28.message));
                                        return [2 /*return*/, []];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 1:
                    groups = _a.sent();
                    all = groups.flat();
                    seen = new Set();
                    return [2 /*return*/, all.filter(function (stream) {
                            var key = "".concat(stream.url, "|").concat(stream.quality);
                            if (seen.has(key))
                                return false;
                            seen.add(key);
                            return true;
                        })];
            }
        });
    });
}
function fetchStreamsForSlugLocal(slug, type, epNumber) {
    return __awaiter(this, void 0, void 0, function () {
        var episodeCandidates, _loop_2, episodeCandidates_1, episodeCandidates_1_1, candidateEp, state_1, e_29_1;
        var e_29, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    episodeCandidates = type === 'movie'
                        ? __spreadArray([], __read(new Set([0, epNumber])), false) : [epNumber];
                    _loop_2 = function (candidateEp) {
                        var servers, e_30, streams, usableStreams;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    servers = [];
                                    _c.label = 1;
                                case 1:
                                    _c.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, getEpisodeServers(slug, candidateEp)];
                                case 2:
                                    servers = _c.sent();
                                    return [3 /*break*/, 4];
                                case 3:
                                    e_30 = _c.sent();
                                    console.warn("[AnimeAV1] No se pudieron leer servidores de ".concat(slug, "/E").concat(candidateEp, ": ").concat(e_30.message));
                                    return [3 /*break*/, 4];
                                case 4:
                                    if (!servers.length) {
                                        console.warn("[AnimeAV1] ".concat(slug, "/E").concat(candidateEp, " no contiene servidores soportados; probando alternativa"));
                                        return [2 /*return*/, "continue"];
                                    }
                                    return [4 /*yield*/, extractAnimeAV1StreamsLocal(servers).catch(function (e) {
                                            console.warn("[AnimeAV1] Fall\u00F3 la extracci\u00F3n de ".concat(slug, "/E").concat(candidateEp, ": ").concat(e.message));
                                            return [];
                                        })];
                                case 5:
                                    streams = _c.sent();
                                    usableStreams = (streams || []).filter(function (stream) { return isUsableHttpStreamUrlLocal(stream === null || stream === void 0 ? void 0 : stream.url); });
                                    if (usableStreams.length) {
                                        console.log("[AnimeAV1] Episodio elegido ".concat(slug, "/E").concat(candidateEp, ": ").concat(usableStreams.length, " URL(s) HLS v\u00E1lidas"));
                                        return [2 /*return*/, { value: usableStreams }];
                                    }
                                    console.warn("[AnimeAV1] ".concat(slug, "/E").concat(candidateEp, " detect\u00F3 servidores pero no produjo URLs HLS utilizables; probando alternativa"));
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 6, 7, 8]);
                    episodeCandidates_1 = __values(episodeCandidates), episodeCandidates_1_1 = episodeCandidates_1.next();
                    _b.label = 2;
                case 2:
                    if (!!episodeCandidates_1_1.done) return [3 /*break*/, 5];
                    candidateEp = episodeCandidates_1_1.value;
                    return [5 /*yield**/, _loop_2(candidateEp)];
                case 3:
                    state_1 = _b.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _b.label = 4;
                case 4:
                    episodeCandidates_1_1 = episodeCandidates_1.next();
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 8];
                case 6:
                    e_29_1 = _b.sent();
                    e_29 = { error: e_29_1 };
                    return [3 /*break*/, 8];
                case 7:
                    try {
                        if (episodeCandidates_1_1 && !episodeCandidates_1_1.done && (_a = episodeCandidates_1.return)) _a.call(episodeCandidates_1);
                    }
                    finally { if (e_29) throw e_29.error; }
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/, []];
            }
        });
    });
}
function acceptSeasonMatchLocal(matchInfo, year, seasonNum, termRecord) {
    var _a, _b, _c, _d;
    if (termRecord === void 0) { termRecord = {}; }
    if (!matchInfo || !((_a = matchInfo.candidate) === null || _a === void 0 ? void 0 : _a.slug) || !matchInfo.accepted) {
        if (!matchInfo || !((_b = matchInfo.candidate) === null || _b === void 0 ? void 0 : _b.slug) || seasonNum <= 1)
            return false;
        if (!termRecord.seasonIdentity || termRecord.targetSeason !== seasonNum)
            return false;
        if (matchInfo.candidateSeason !== undefined && matchInfo.candidateSeason !== seasonNum)
            return false;
        var fullTitleExact = normalizeTitle((_c = matchInfo.candidate) === null || _c === void 0 ? void 0 : _c.title) === normalizeTitle(termRecord.term);
        var fullTokenSimilarity = wordSimilarity(termRecord.term, ((_d = matchInfo.candidate) === null || _d === void 0 ? void 0 : _d.title) || '');
        return Boolean(matchInfo.score >= 85 && (fullTitleExact || fullTokenSimilarity >= 0.85));
    }
    return true;
}
function resolveAnimeAV1LocalFresh(tmdbId, type, seasonNum, epNumber, cacheKey) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, info, seasonInfo, altTitles, seasonYear, targetSeasonYear, baseDirectTerms, searchedTerms, triedSlugs, bestAttempt, catalogError, tryTerms, resolution, aliInfo, targetSpecificTerms, seasonalSynonyms, aliasTerms, safeFallbackTerms, aliasTerms, legacyInfo, legacyTerms;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log("[AnimeAV1] Fallback local 1.2.11: TMDB ".concat(tmdbId, " (").concat(type, ") S").concat(seasonNum, "E").concat(epNumber));
                    return [4 /*yield*/, Promise.all([
                            getTMDBInfo(tmdbId, type),
                            type === 'movie' ? Promise.resolve({ year: undefined, name: '', airDate: '' }) : getTMDBSeasonInfoLocal(tmdbId, seasonNum),
                            getTMDBAlternativeTitlesLocal(tmdbId, type)
                        ])];
                case 1:
                    _a = __read.apply(void 0, [_b.sent(), 3]), info = _a[0], seasonInfo = _a[1], altTitles = _a[2];
                    if (!info) {
                        console.warn("[AnimeAV1] TMDB no devolvi\u00F3 informaci\u00F3n para ".concat(tmdbId));
                        return [2 /*return*/, []];
                    }
                    if (!looksLikeAnime(info)) {
                        console.warn("[AnimeAV1] Contenido descartado por filtro de anime: \"".concat(info.title, "\""));
                        return [2 /*return*/, []];
                    }
                    seasonYear = type === 'movie' ? info.year : (seasonInfo.year || info.year);
                    targetSeasonYear = type === 'movie' || seasonNum === 1 ? seasonYear : seasonInfo.year;
                    baseDirectTerms = uniqueTitleRecordsLocal(__spreadArray([
                        { term: seasonNum > 1 && type !== 'movie' ? "".concat(info.title, " ").concat(seasonNum) : info.title, origin: 'tmdb-title' },
                        { term: info.title, origin: 'tmdb-title' },
                        { term: info.originalTitle, origin: 'tmdb-original-title' },
                        { term: seasonInfo.name, origin: 'tmdb-season-title' }
                    ], __read((altTitles || []).map(function (term) { return ({ term: term, origin: 'tmdb-alternative' }); })), false), 12);
                    searchedTerms = new Set();
                    triedSlugs = new Set();
                    bestAttempt = null;
                    catalogError = null;
                    tryTerms = function (terms, targetYear, phase) { return __awaiter(_this, void 0, void 0, function () {
                        var terms_1, terms_1_1, recordValue, record, term, normalized, yearsToTry, _loop_3, yearsToTry_1, yearsToTry_1_1, year, state_2, e_31_1, e_32_1;
                        var e_32, _a, e_31, _b;
                        var _c, _d;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    _e.trys.push([0, 11, 12, 13]);
                                    terms_1 = __values(terms), terms_1_1 = terms_1.next();
                                    _e.label = 1;
                                case 1:
                                    if (!!terms_1_1.done) return [3 /*break*/, 10];
                                    recordValue = terms_1_1.value;
                                    record = typeof recordValue === 'string' ? { term: recordValue, origin: phase } : recordValue;
                                    term = record.term;
                                    normalized = normalizeTitle(term);
                                    if (!normalized)
                                        return [3 /*break*/, 9];
                                    yearsToTry = targetYear ? [targetYear, undefined] : [undefined];
                                    _loop_3 = function (year) {
                                        var evidenceKey, attemptKey, candidates, error_4, matchInfo, accepted, match, streams;
                                        return __generator(this, function (_f) {
                                            switch (_f.label) {
                                                case 0:
                                                    evidenceKey = record.seasonIdentity ? "|verified-s".concat(record.targetSeason) : '';
                                                    attemptKey = "".concat(normalized, "|").concat(year !== null && year !== void 0 ? year : '').concat(evidenceKey);
                                                    if (searchedTerms.has(attemptKey))
                                                        return [2 /*return*/, "continue"];
                                                    searchedTerms.add(attemptKey);
                                                    candidates = void 0;
                                                    _f.label = 1;
                                                case 1:
                                                    _f.trys.push([1, 3, , 4]);
                                                    return [4 /*yield*/, searchAnimeAV1(term, year, seasonNum)];
                                                case 2:
                                                    candidates = _f.sent();
                                                    return [3 /*break*/, 4];
                                                case 3:
                                                    error_4 = _f.sent();
                                                    catalogError = error_4;
                                                    console.warn("[AnimeAV1] B\u00FAsqueda local (".concat(record.origin || phase, ") \"").concat(term, "\" a\u00F1o=").concat(year !== null && year !== void 0 ? year : 'ninguno', " fall\u00F3: ").concat(error_4.message));
                                                    return [2 /*return*/, { value: [] }];
                                                case 4:
                                                    matchInfo = pickBestMatch(candidates, term, seasonNum);
                                                    if (!matchInfo)
                                                        return [2 /*return*/, "continue"];
                                                    accepted = acceptSeasonMatchLocal(matchInfo, year, seasonNum, record);
                                                    if (!bestAttempt || matchInfo.score > bestAttempt.score)
                                                        bestAttempt = { term: term, title: (_c = matchInfo.candidate) === null || _c === void 0 ? void 0 : _c.title, score: matchInfo.score, accepted: accepted };
                                                    match = matchInfo.candidate;
                                                    if (!accepted || !(match === null || match === void 0 ? void 0 : match.slug) || triedSlugs.has(match.slug))
                                                        return [2 /*return*/, "continue"];
                                                    triedSlugs.add(match.slug);
                                                    console.log("[AnimeAV1] Match local (".concat(record.origin || phase, "): \"").concat(match.title, "\" slug=").concat(match.slug, " score=").concat(matchInfo.score.toFixed(1), " gap=").concat(matchInfo.gap.toFixed(1), " season=").concat((_d = matchInfo.candidateSeason) !== null && _d !== void 0 ? _d : '?', " term=\"").concat(term, "\""));
                                                    return [4 /*yield*/, fetchStreamsForSlugLocal(match.slug, type, epNumber).catch(function (error) {
                                                            console.warn("[AnimeAV1] Error probando slug \"".concat(match.slug, "\": ").concat(error.message));
                                                            return [];
                                                        })];
                                                case 5:
                                                    streams = _f.sent();
                                                    if (streams.length) {
                                                        maintainResolverCache(animeAV1LocalCache, LOCAL_RESOLVER_CACHE_TTL_MS);
                                                        animeAV1LocalCache.set(cacheKey, { slug: match.slug, title: match.title, score: matchInfo.score, timestamp: Date.now() });
                                                        console.log("[AnimeAV1] \u2713 Resolver local encontr\u00F3 ".concat(streams.length, " streams"));
                                                        return [2 /*return*/, { value: streams }];
                                                    }
                                                    console.warn("[AnimeAV1] El candidato \"".concat(match.title, "\" no produjo streams; se probar\u00E1 otra alternativa"));
                                                    return [2 /*return*/];
                                            }
                                        });
                                    };
                                    _e.label = 2;
                                case 2:
                                    _e.trys.push([2, 7, 8, 9]);
                                    yearsToTry_1 = (e_31 = void 0, __values(yearsToTry)), yearsToTry_1_1 = yearsToTry_1.next();
                                    _e.label = 3;
                                case 3:
                                    if (!!yearsToTry_1_1.done) return [3 /*break*/, 6];
                                    year = yearsToTry_1_1.value;
                                    return [5 /*yield**/, _loop_3(year)];
                                case 4:
                                    state_2 = _e.sent();
                                    if (typeof state_2 === "object")
                                        return [2 /*return*/, state_2.value];
                                    _e.label = 5;
                                case 5:
                                    yearsToTry_1_1 = yearsToTry_1.next();
                                    return [3 /*break*/, 3];
                                case 6: return [3 /*break*/, 9];
                                case 7:
                                    e_31_1 = _e.sent();
                                    e_31 = { error: e_31_1 };
                                    return [3 /*break*/, 9];
                                case 8:
                                    try {
                                        if (yearsToTry_1_1 && !yearsToTry_1_1.done && (_b = yearsToTry_1.return)) _b.call(yearsToTry_1);
                                    }
                                    finally { if (e_31) throw e_31.error; }
                                    return [7 /*endfinally*/];
                                case 9:
                                    terms_1_1 = terms_1.next();
                                    return [3 /*break*/, 1];
                                case 10: return [3 /*break*/, 13];
                                case 11:
                                    e_32_1 = _e.sent();
                                    e_32 = { error: e_32_1 };
                                    return [3 /*break*/, 13];
                                case 12:
                                    try {
                                        if (terms_1_1 && !terms_1_1.done && (_a = terms_1.return)) _a.call(terms_1);
                                    }
                                    finally { if (e_32) throw e_32.error; }
                                    return [7 /*endfinally*/];
                                case 13: return [2 /*return*/, []];
                            }
                        });
                    }); };
                    resolution = null;
                    if (!(seasonNum > 1 && type === 'tv')) return [3 /*break*/, 10];
                    targetSpecificTerms = baseDirectTerms.filter(function (record) { return getExplicitSeason(record.term) === seasonNum; });
                    if (!targetSpecificTerms.length) return [3 /*break*/, 3];
                    return [4 /*yield*/, tryTerms(targetSpecificTerms.slice(0, 2), targetSeasonYear, 'TMDB temporada')];
                case 2:
                    resolution = _b.sent();
                    _b.label = 3;
                case 3:
                    if (catalogError)
                        return [2 /*return*/, []];
                    if (!!resolution) return [3 /*break*/, 5];
                    return [4 /*yield*/, resolveAniListIdentityLocal(info, seasonNum, targetSeasonYear, __spreadArray([seasonInfo.name], __read((altTitles || [])), false)).catch(function (error) {
                            console.warn("[AniList] No se pudo resolver identidad de temporada: ".concat(error.message));
                            return undefined;
                        })];
                case 4:
                    aliInfo = _b.sent();
                    _b.label = 5;
                case 5:
                    if (!(!resolution && (aliInfo === null || aliInfo === void 0 ? void 0 : aliInfo.seasonVerified) && aliInfo.seasonNum === seasonNum)) return [3 /*break*/, 7];
                    seasonalSynonyms = (aliInfo.synonyms || []).slice().sort(function (a, b) {
                        return Number(getExplicitSeason(b) === seasonNum) - Number(getExplicitSeason(a) === seasonNum);
                    });
                    aliasTerms = uniqueTitleRecordsLocal(__spreadArray(__spreadArray([
                        { term: aliInfo.romajiTitle, origin: 'anilist-season-romaji', seasonIdentity: true, targetSeason: seasonNum }
                    ], __read(seasonalSynonyms.map(function (term) { return ({ term: term, origin: 'anilist-season-synonym', seasonIdentity: true, targetSeason: seasonNum }); })), false), [
                        { term: aliInfo.englishTitle, origin: 'anilist-season-english', seasonIdentity: true, targetSeason: seasonNum },
                        { term: aliInfo.nativeTitle, origin: 'anilist-season-native', seasonIdentity: true, targetSeason: seasonNum }
                    ], false), 6);
                    return [4 /*yield*/, tryTerms(aliasTerms, aliInfo.year || seasonYear, 'AniList temporada verificada')];
                case 6:
                    resolution = _b.sent();
                    if (catalogError)
                        return [2 /*return*/, []];
                    _b.label = 7;
                case 7:
                    if (!!resolution) return [3 /*break*/, 9];
                    safeFallbackTerms = baseDirectTerms.filter(function (record) {
                        return ['tmdb-title', 'tmdb-original-title'].includes(record.origin) || getExplicitSeason(record.term) === seasonNum;
                    }).sort(function (a, b) { return Number(getExplicitSeason(b.term) === seasonNum) - Number(getExplicitSeason(a.term) === seasonNum); });
                    return [4 /*yield*/, tryTerms(safeFallbackTerms, targetSeasonYear, 'fallback TMDB seguro')];
                case 8:
                    resolution = _b.sent();
                    if (catalogError)
                        return [2 /*return*/, []];
                    _b.label = 9;
                case 9: return [3 /*break*/, 17];
                case 10: return [4 /*yield*/, tryTerms(baseDirectTerms, seasonYear, 'TMDB')];
                case 11:
                    resolution = _b.sent();
                    if (catalogError)
                        return [2 /*return*/, []];
                    if (!!resolution) return [3 /*break*/, 14];
                    return [4 /*yield*/, resolveAniListIdentityLocal(info, seasonNum, seasonYear, __spreadArray([seasonInfo.name], __read((altTitles || [])), false)).catch(function (error) {
                            console.warn("[AniList] No se pudo resolver identidad alternativa: ".concat(error.message));
                            return undefined;
                        })];
                case 12:
                    aliInfo = _b.sent();
                    if (!aliInfo) return [3 /*break*/, 14];
                    aliasTerms = uniqueTitleRecordsLocal(__spreadArray(__spreadArray([
                        { term: aliInfo.romajiTitle, origin: 'anilist-romaji' },
                        { term: aliInfo.englishTitle, origin: 'anilist-english' },
                        { term: aliInfo.nativeTitle, origin: 'anilist-native' },
                        { term: seasonInfo.name, origin: 'tmdb-season-title' },
                        { term: info.title, origin: 'tmdb-title' },
                        { term: info.originalTitle, origin: 'tmdb-original-title' }
                    ], __read((aliInfo.synonyms || []).map(function (term) { return ({ term: term, origin: 'anilist-synonym' }); })), false), __read((altTitles || []).map(function (term) { return ({ term: term, origin: 'tmdb-alternative' }); })), false), 12);
                    return [4 /*yield*/, tryTerms(aliasTerms, aliInfo.year || seasonYear, 'AniList/TMDB')];
                case 13:
                    resolution = _b.sent();
                    if (catalogError)
                        return [2 /*return*/, []];
                    _b.label = 14;
                case 14:
                    if (!!resolution) return [3 /*break*/, 17];
                    return [4 /*yield*/, getAniListInfo(info.title, seasonNum).catch(function () { return undefined; })];
                case 15:
                    legacyInfo = _b.sent();
                    if (!legacyInfo) return [3 /*break*/, 17];
                    legacyTerms = uniqueTitleRecordsLocal(__spreadArray([
                        { term: legacyInfo.romajiTitle, origin: 'anilist-romaji-legacy' },
                        { term: info.title, origin: 'tmdb-title' },
                        { term: info.originalTitle, origin: 'tmdb-original-title' }
                    ], __read((altTitles || []).map(function (term) { return ({ term: term, origin: 'tmdb-alternative' }); })), false), 8);
                    return [4 /*yield*/, tryTerms(legacyTerms, legacyInfo.year || seasonYear, 'AniList histórico')];
                case 16:
                    resolution = _b.sent();
                    if (catalogError)
                        return [2 /*return*/, []];
                    _b.label = 17;
                case 17:
                    if (!resolution) {
                        console.warn("[AnimeAV1] No se encontr\u00F3 un slug reproducible con confianza para TMDB ".concat(tmdbId, " S").concat(seasonNum, "; mejor candidato: ").concat(bestAttempt ? "".concat(bestAttempt.title, " (").concat(bestAttempt.score.toFixed(1), ", aceptado=").concat(bestAttempt.accepted, ")") : 'ninguno'));
                        return [2 /*return*/, []];
                    }
                    return [2 /*return*/, resolution];
            }
        });
    });
}
function resolveAnimeAV1Local(tmdbId, type, season, episode) {
    return __awaiter(this, void 0, void 0, function () {
        var seasonNum, epNumber, key, cached, streams, e_33, legacyError_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!tmdbId || !type)
                        return [2 /*return*/, []];
                    seasonNum = type === 'movie' ? 1 : (season ? Number(season) : 1);
                    epNumber = type === 'movie' ? 1 : (episode !== undefined ? Number(episode) : 1);
                    key = resolverCacheKey(tmdbId, type, seasonNum);
                    cached = animeAV1LocalCache.get(key);
                    if (!(cached && Date.now() - cached.timestamp < LOCAL_RESOLVER_CACHE_TTL_MS)) return [3 /*break*/, 2];
                    animeAV1LocalCache.delete(key);
                    animeAV1LocalCache.set(key, cached);
                    console.log("[AnimeAV1] Cach\u00E9 del resolver local: TMDB ".concat(tmdbId, " S").concat(seasonNum, " -> ").concat(cached.slug));
                    return [4 /*yield*/, fetchStreamsForSlugLocal(cached.slug, type, epNumber).catch(function () { return []; })];
                case 1:
                    streams = _a.sent();
                    if (streams.length)
                        return [2 /*return*/, streams];
                    animeAV1LocalCache.delete(key);
                    console.warn('[AnimeAV1] Caché local sin streams; se vuelve a resolver');
                    return [3 /*break*/, 3];
                case 2:
                    if (cached)
                        animeAV1LocalCache.delete(key);
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 5, , 10]);
                    return [4 /*yield*/, resolveAnimeAV1LocalFresh(tmdbId, type, seasonNum, epNumber, key)];
                case 4: return [2 /*return*/, _a.sent()];
                case 5:
                    e_33 = _a.sent();
                    console.error("[AnimeAV1] Error del fallback local: ".concat(e_33.message));
                    if (!(type === 'movie' || seasonNum === 1)) return [3 /*break*/, 9];
                    _a.label = 6;
                case 6:
                    _a.trys.push([6, 8, , 9]);
                    return [4 /*yield*/, resolveAnimeAV1LocalLegacy(tmdbId, type, seasonNum, epNumber)];
                case 7: return [2 /*return*/, _a.sent()];
                case 8:
                    legacyError_1 = _a.sent();
                    console.error("[AnimeAV1] M\u00E9todo local heredado fall\u00F3: ".concat(legacyError_1.message));
                    return [2 /*return*/, []];
                case 9: 
                // For S2+, fail closed: the previous resolver could accept a markerless
                // result from title/year alone, precisely the ambiguity this fallback fixes.
                return [2 /*return*/, []];
                case 10: return [2 /*return*/];
            }
        });
    });
}
exports.getStreams = function (tmdbId, type, season, episode) {
    return __awaiter(this, void 0, void 0, function () {
        var seasonNum, epNumber, identity, streams, e_34, streams, e_35;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!tmdbId || !type)
                        return [2 /*return*/, []];
                    seasonNum = type === 'movie' ? 1 : (season ? Number(season) : 1);
                    epNumber = type === 'movie' ? 1 : (episode !== undefined ? Number(episode) : 1);
                    if (!['movie', 'tv'].includes(type)) {
                        console.warn("[AnimeAV1] Solicitud inv\u00E1lida: tipo no admitido (".concat(type, "); no se ejecuta fallback"));
                        return [2 /*return*/, []];
                    }
                    console.log("[AnimeAV1] 1.2.11 (remoto principal + fallback condicionado) Resolviendo: TMDB ".concat(tmdbId, " (").concat(type, ") S").concat(seasonNum, "E").concat(epNumber));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, getRemoteAnimeIdentity(tmdbId, type, seasonNum)];
                case 2:
                    identity = _a.sent();
                    return [4 /*yield*/, fetchStreamsForSlugLocal(identity.slug, type, epNumber)];
                case 3:
                    streams = _a.sent();
                    if (streams.length) {
                        console.log("[AnimeAV1] \u2713 Resolver remoto confirm\u00F3 slug \"".concat(identity.slug, "\" y entreg\u00F3 ").concat(streams.length, " streams"));
                        return [2 /*return*/, streams];
                    }
                    console.warn("[AnimeAV1] El resolver remoto devolvi\u00F3 slug \"".concat(identity.slug, "\" pero no streams; se activa fallback local"));
                    animeAV1RemoteCache.delete(resolverCacheKey(tmdbId, type, seasonNum));
                    return [3 /*break*/, 5];
                case 4:
                    e_34 = _a.sent();
                    if ((e_34 === null || e_34 === void 0 ? void 0 : e_34.fallbackAllowed) === false) {
                        console.warn("[AnimeAV1] Resolver remoto finaliz\u00F3 sin fallback (".concat(e_34.reason || 'respuesta definitiva', "): ").concat(e_34.message));
                        return [2 /*return*/, []];
                    }
                    console.warn("[AnimeAV1] Resolver remoto fall\u00F3 t\u00E9cnicamente (".concat(e_34.message, "); se activa fallback local"));
                    return [3 /*break*/, 5];
                case 5:
                    _a.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, resolveAnimeAV1Local(tmdbId, type, seasonNum, epNumber)];
                case 6:
                    streams = _a.sent();
                    if (streams.length)
                        console.log("[AnimeAV1] \u2713 Fallback local devolvi\u00F3 ".concat(streams.length, " streams"));
                    return [2 /*return*/, streams || []];
                case 7:
                    e_35 = _a.sent();
                    console.error("[AnimeAV1] Fall\u00F3 el flujo remoto/local: ".concat(e_35.message));
                    return [2 /*return*/, []];
                case 8: return [2 /*return*/];
            }
        });
    });
};
