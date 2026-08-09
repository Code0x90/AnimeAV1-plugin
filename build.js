// build.js
// Bundlea providers desde src/<name>/index.js con esbuild y transpila
// async/await a generator functions (Babel) para compatibilidad con Hermes (Nuvio/React Native).
//
// Uso:
//   node build.js                 -> compila todos los providers en src/
//   node build.js animeav1        -> compila solo src/animeav1
//   node build.js --minify [name] -> igual, pero minificado

const fs = require('fs')
const path = require('path')
const esbuild = require('esbuild')
const babel = require('@babel/core')

const SRC_DIR = path.join(__dirname, 'src')
const OUT_DIR = path.join(__dirname, 'providers')

function getProviderNames(args) {
  if (args.length > 0) return args
  if (!fs.existsSync(SRC_DIR)) return []
  return fs.readdirSync(SRC_DIR).filter((name) => {
    const full = path.join(SRC_DIR, name)
    return fs.statSync(full).isDirectory() && !name.startsWith('_')
  })
}

function buildProvider(name, { minify }) {
  const entry = path.join(SRC_DIR, name, 'index.js')
  if (!fs.existsSync(entry)) {
    console.error(`✗ ${name}: no se encontró ${entry}`)
    return
  }

  // 1) Bundle con esbuild (resuelve imports/requires internos a un solo archivo)
  const bundleResult = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: 'neutral',
    mainFields: ['main', 'module'],
    format: 'cjs',
    target: 'es2017', // mantenemos async/await aquí; Babel lo baja a generators después
    write: false,
    minify: false, // minificamos (si aplica) después del paso de Babel
    logLevel: 'warning'
  })

  const bundledCode = bundleResult.outputFiles[0].text

  // 2) Transpila async/await -> generator functions (Hermes-safe) con Babel
  const babelResult = babel.transformSync(bundledCode, {
    babelrc: false,
    configFile: false,
    presets: [
      [require.resolve('@babel/preset-env'), {
        targets: { node: '4' }, // muy antiguo a propósito: obliga a transformar for-of, destructuring, etc.
        modules: false,
        useBuiltIns: false,
        exclude: ['transform-typeof-symbol']
      }]
    ],
    // Forzamos explícitamente async/await -> generators, independientemente
    // de lo que decida el target de preset-env (Node moderno soporta async
    // nativo, pero Hermes/React Native en plugins dinámicos no).
    plugins: [
      require.resolve('@babel/plugin-transform-async-to-generator')
    ],
    minified: minify,
    compact: minify,
    comments: !minify
  })

  let finalCode = babelResult.code

  // El runtime de regenerator es necesario para que las generator functions
  // transpiladas funcionen sin depender de un `require('regenerator-runtime')`
  // externo (Hermes carga el provider como archivo aislado).
  const regeneratorRuntimePath = require.resolve('regenerator-runtime/runtime')
  const regeneratorSrc = fs.readFileSync(regeneratorRuntimePath, 'utf8')
  finalCode = `${regeneratorSrc}\n${finalCode}`

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
  const outPath = path.join(OUT_DIR, `${name}.js`)
  fs.writeFileSync(outPath, finalCode, 'utf8')
  console.log(`✓ ${name} -> providers/${name}.js (${(finalCode.length / 1024).toFixed(1)} KB)`)
}

function main() {
  const rawArgs = process.argv.slice(2)
  const minify = rawArgs.includes('--minify')
  const names = getProviderNames(rawArgs.filter((a) => a !== '--minify' && a !== '--transpile'))

  if (names.length === 0) {
    console.error('No hay providers para compilar en src/')
    process.exit(1)
  }

  for (const name of names) {
    buildProvider(name, { minify })
  }
}

main()
