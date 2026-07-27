#!/usr/bin/env node
/**
 * Publica uma versão do AnCut HUB no GitHub Releases.
 *
 *   node scripts/release.mjs 1.1.0 --notes "o que mudou"
 *   node scripts/release.mjs 1.2.0 --notes-file notas.txt --engine
 *
 * O que sobe é DELTA, não o app inteiro:
 *
 *   ui      resources/app.asar          ~3 MB   sempre
 *   engine  engine/CorteCenas.exe + …   ~45 MB  só com --engine
 *
 * Os ~5 GB de torch/CUDA/Chromium ficam na máquina do usuário. O caminho
 * dentro do zip espelha a raiz da instalação, então o apply-update.ps1 só
 * precisa despejar por cima com robocopy.
 *
 * Bandeiras:
 *   --engine     inclui o motor Python (use quando o código em app/ mudou)
 *   --full-ui    empacota o win-unpacked inteiro em vez de só o app.asar.
 *                OBRIGATÓRIO quando a versão do Electron muda: o app.asar
 *                sozinho deixaria o Chromium velho com código novo.
 *   --dry-run    monta tudo e mostra, sem publicar
 *   --ci         roda no GitHub Actions (versão vem da tag, sem --engine)
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** Saída do PyInstaller no projeto do motor (fora deste repositório). */
const ENGINE_DIST = resolve(ROOT, '..', 'AnCut HUB', 'dist', 'CorteCenas')
const WORK = join(ROOT, 'release', '_publish')

// ------------------------------------------------------------------ args

const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const valueOf = (flag) => {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : null
}

const CI = has('--ci')
const DRY = has('--dry-run')
const WITH_ENGINE = has('--engine') && !CI
const FULL_UI = has('--full-ui')

const version = (argv.find((a) => /^\d+\.\d+\.\d+$/.test(a)) ?? process.env.RELEASE_VERSION ?? '')
  .trim()
if (!version) fail('informe a versão, ex: node scripts/release.mjs 1.1.0')

const notesFile = valueOf('--notes-file')
const notes = (notesFile ? readFileSync(resolve(notesFile), 'utf-8') : valueOf('--notes') ?? '').trim()
if (!notes) fail('informe as notas com --notes "…" ou --notes-file arquivo.txt')

// ------------------------------------------------------------------ build

log(`AnCut HUB ${version}${WITH_ENGINE ? ' (com motor)' : ''}${DRY ? ' — ensaio' : ''}`)

// A versão precisa entrar no package.json ANTES do build: ela viaja dentro do
// app.asar e é o que o app instalado compara com o manifesto.
const pkgPath = join(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
if (pkg.version !== version) {
  pkg.version = version
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
  log(`package.json → ${version}`)
}

run('npm', ['run', 'build'])
run('npx', ['electron-builder', '--win', '--dir'])

const unpacked = join(ROOT, 'release', version, 'win-unpacked')
if (!existsSync(unpacked)) fail(`não achei o build em ${unpacked}`)

// --------------------------------------------------------------- empacota

rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })

const packages = {}
packages.ui = pack('ui', `ancut-ui-${version}.zip`, (stage) => {
  if (FULL_UI) {
    cpSync(unpacked, stage, { recursive: true })
  } else {
    mkdirSync(join(stage, 'resources'), { recursive: true })
    cpSync(join(unpacked, 'resources', 'app.asar'), join(stage, 'resources', 'app.asar'))
  }
})

if (WITH_ENGINE) {
  if (!existsSync(ENGINE_DIST)) fail(`motor não encontrado em ${ENGINE_DIST} — rode o PyInstaller antes`)
  packages.engine = pack('engine', `ancut-engine-${version}.zip`, (stage) => {
    const dest = join(stage, 'engine')
    mkdirSync(dest, { recursive: true })
    // Só o que muda de versão pra versão. O resto de _internal (torch, CUDA,
    // PySide6) pesa GB e é idêntico — mandar junto seria desperdício puro.
    cpSync(join(ENGINE_DIST, 'CorteCenas.exe'), join(dest, 'CorteCenas.exe'))
    cpSync(join(ENGINE_DIST, '_internal', 'app'), join(dest, '_internal', 'app'), {
      recursive: true
    })
  })
}

const manifest = { version, date: new Date().toISOString().slice(0, 10), notes, packages }
const manifestPath = join(WORK, 'manifest.json')
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')

log('')
log('manifesto:')
for (const [name, p] of Object.entries(packages)) {
  log(`  ${name.padEnd(7)} ${p.file}  ${(p.size / 1e6).toFixed(1)} MB  ${p.sha256.slice(0, 12)}…`)
}

// --------------------------------------------------------------- publica

const assets = [manifestPath, ...Object.values(packages).map((p) => join(WORK, p.file))]

if (DRY) {
  log('')
  log('ensaio — nada foi publicado. Assets prontos em release/_publish/')
  process.exit(0)
}

const notesPath = join(WORK, 'notes.md')
writeFileSync(notesPath, `${notes}\n`, 'utf-8')

run('gh', [
  'release',
  'create',
  `v${version}`,
  '--title',
  `AnCut HUB ${version}`,
  '--notes-file',
  notesPath,
  ...assets
])

log('')
log(`publicado: v${version}`)
log('O app instalado vê a novidade na próxima abertura (ou em Configurações →')
log('Procurar atualizações).')

// ----------------------------------------------------------------- helpers

/** Monta a árvore num staging, comprime e devolve {file, sha256, size}. */
function pack(name, file, build) {
  const stage = join(WORK, `_${name}`)
  mkdirSync(stage, { recursive: true })
  build(stage)

  const zip = join(WORK, file)
  // Compress-Archive e não tar: é o par exato do Expand-Archive que o app
  // usa pra extrair, então não há surpresa de formato entre as duas pontas.
  run('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Compress-Archive -Path '${stage}\\*' -DestinationPath '${zip}' -Force`
  ])
  rmSync(stage, { recursive: true, force: true })

  return {
    file,
    sha256: createHash('sha256').update(readFileSync(zip)).digest('hex'),
    size: statSync(zip).size
  }
}

function run(cmd, args) {
  log(`$ ${cmd} ${args.slice(0, 3).join(' ')}${args.length > 3 ? ' …' : ''}`)
  // shell: true porque npm e npx no Windows são .cmd, que o spawn direto não
  // executa. O preço é que o Node NÃO cita os argumentos nesse modo: sem as
  // aspas abaixo, "AnCut HUB 1.1.0" chegaria como três argumentos e todo
  // caminho com espaço quebraria.
  const quoted = args.map((a) => (/^[\w.\-=/\\:]+$/.test(a) ? a : `"${a}"`))
  execFileSync(cmd, quoted, { cwd: ROOT, stdio: 'inherit', shell: true })
}

function log(msg) {
  process.stdout.write(`${msg}\n`)
}

function fail(msg) {
  process.stderr.write(`erro: ${msg}\n`)
  process.exit(1)
}
