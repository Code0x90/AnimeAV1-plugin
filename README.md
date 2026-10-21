# AnimeAV1 Nuvio Provider 1.2.10

Esta versión utiliza el resolver remoto como primera opción. Si el remoto confirma una negativa definitiva (`no_confident_match`, `not_anime` o `tmdb_not_found`), no se activa la búsqueda local. El fallback se reserva para fallos técnicos (timeout, red, HTTP 429/5xx, JSON inválido o respuesta desconocida) y para un slug remoto que no produce streams reproducibles.

Los extractores HLS-Zilla y Voe se mantienen. La fuente editable está en `src/animeav1/index.js`; el bundle consumido por Nuvio está en `providers/animeav1.js`.

## Compilar desde la fuente

```bash
npm install
npm run build -- animeav1
```

## Comprobar con ADB

Durante la prueba debe aparecer `[AnimeAV1] 1.2.10 (remoto principal + fallback condicionado) Resolviendo`. Si el remoto devuelve una negativa definitiva, aparecerá `Resolver remoto finalizó sin fallback`; ante fallos técnicos aparecerá `se activa fallback local` y registros de `Fallback local 1.2.10`.

## Películas publicadas como episodio 0

Para películas, el provider prueba `/media/<slug>/0` primero. Si esa página no devuelve servidores soportados o no genera URLs HLS no vacías, prueba `/1`. Las URLs vacías o malformadas se descartan para no mostrar sources fantasma. Los extractores HLS-Zilla y Voe se mantienen integrados.

## Pruebas de regresión

Ejecutar las pruebas del código fuente y del bundle que carga Nuvio, incluidas las temporadas verificadas, fallos de red, timeout remoto y el caso de película en episodio 0:

```bash
npm test
```

## Cambios en 1.2.10

- Se mantiene el resolver remoto como ruta principal y se condiciona el fallback por tipo de resultado. No hay fallback para `no_confident_match`, `not_anime`, `tmdb_not_found`, peticiones inválidas (HTTP 400/422) o tipos no admitidos.
- El fallback local verifica la temporada solicitada con títulos explícitos de AniList o su cadena de relaciones `PREQUEL`; ya no acepta temporadas S2+ solo por parecido de título y año.
- Los alias de una temporada solo pueden habilitar una coincidencia sin sufijo explícito si la identidad de temporada quedó verificada.
- La búsqueda local usa caché normalizada y acotada, incluye búsquedas vacías, elimina entradas vencidas y avanza por variantes hasta hallar una coincidencia fuerte.
- Los fallos técnicos remotos (timeout, conexión, JSON inválido, HTTP 429 y 5xx) conservan el fallback. Una respuesta de fallo desconocida también permite recuperación local, sin tratarse como negativa definitiva.
- Se mantiene el fallback si existe un slug remoto válido pero no se obtienen streams reproducibles, para permitir recuperación ante un resultado remoto incompleto.
- Se mantienen los extractores HLS-Zilla/Voe y las pruebas para películas publicadas como episodio 0.

## Pruebas completas

```bash
npm test
```
