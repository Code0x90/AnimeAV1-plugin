# AnimeAV1 Nuvio Provider 1.2.5

Esta versión utiliza el resolver remoto como primera opción. Si el servicio remoto falla, devuelve un slug sin servidores o no se obtienen streams reproducibles, el provider activa la resolución local con TMDB, títulos alternativos de TMDB, AniList y sinónimos, y el catálogo de AnimeAV1.

Los extractores HLS-Zilla y Voe se mantienen. La fuente editable está en `src/animeav1/index.js`; el bundle consumido por Nuvio está en `providers/animeav1.js`.

## Compilar desde la fuente

```bash
npm install
npm run build -- animeav1
```

## Comprobar con ADB

Durante la prueba deben aparecer `[AnimeAV1] 1.2.5 (remoto principal + fallback local) Resolviendo`. Si el remoto responde, aparecerá `Resolver remoto encontró` y después `Resolver remoto confirmó slug`. Si falla, aparecerá `Resolver remoto falló ... se activa fallback local` y registros de `Fallback local 1.2.5`.

## Películas publicadas como episodio 0

Para películas, el provider prueba `/media/<slug>/0` primero. Si esa página no devuelve servidores soportados o no genera URLs HLS no vacías, prueba `/1`. Las URLs vacías o malformadas se descartan para no mostrar sources fantasma. Los extractores HLS-Zilla y Voe se mantienen integrados.

## Pruebas de regresión

Ejecutar las pruebas del código fuente y del bundle que carga Nuvio:

```bash
npm run test:movie-episode-zero
npm run test:movie-episode-zero:bundle
```
