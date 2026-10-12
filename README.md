# AnimeAV1 Nuvio Provider 1.2.4

Esta versión utiliza el resolver remoto como primera opción. Si el servicio remoto falla, devuelve un slug sin servidores o no se obtienen streams reproducibles, el provider activa la resolución local con TMDB, títulos alternativos de TMDB, AniList y sinónimos, y el catálogo de AnimeAV1.

Los extractores HLS-Zilla y Voe se mantienen. La fuente editable está en `src/animeav1/index.js`; el bundle consumido por Nuvio está en `providers/animeav1.js`.

## Compilar desde la fuente

```bash
npm install
npm run build -- animeav1
```

## Comprobar con ADB

Durante la prueba deben aparecer `[AnimeAV1] 1.2.4 (remoto principal + fallback local) Resolviendo`. Si el remoto responde, aparecerá `Resolver remoto encontró` y después `Resolver remoto confirmó slug`. Si falla, aparecerá `Resolver remoto falló ... se activa fallback local` y registros de `Fallback local 1.2.4`.
