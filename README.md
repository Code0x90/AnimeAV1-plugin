# AnimeAV1 Nuvio Provider 1.2.0

Provider AnimeAV1 para Nuvio/Kino. Esta versión usa el **AnimeAV1 Resolver** como método principal para identificar el anime y conserva el matching local de 1.1.2 como fallback.

## Flujo

1. `TMDB ID + tipo + temporada` -> `https://animeav1-resolver.onrender.com/resolve`
2. El resolver devuelve el `slug` de AnimeAV1.
3. El plugin consulta directamente los servidores del episodio usando ese slug.
4. El mapping se guarda en memoria durante 24 horas por `TMDB + tipo + temporada`.
5. Si Render falla, hace timeout, devuelve un resultado inválido o el slug válido no tiene servidores, se usa automáticamente el matching local 1.1.2.

No se cachean URLs HLS/Voe ni streams firmados.

## Instalación

Usar `providers/animeav1.js` como provider y `manifest.json` para la versión 1.2.0.

## Resolver

El endpoint usado por defecto es:

`https://animeav1-resolver.onrender.com`

El provider no necesita ninguna variable de entorno para usarlo.
