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
 *   --engine-extra <pasta>
 *                acrescenta uma pasta de _internal/ ao pacote do motor. Use
 *                quando uma DEPENDÊNCIA nova aparecer: o pacote normal leva
 *                só _internal/app (nosso código), então uma biblioteca nova
 *                nunca chegaria na máquina de quem já tem o app instalado.
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

/**
 * Pastas extras de `_internal` que entram no pacote do motor.
 *
 * Uso: --engine-extra onnxruntime --engine-extra outra
 */
const ENGINE_EXTRAS = argv.reduce((acc, a, i) => {
  if (a === '--engine-extra' && argv[i + 1]) acc.push(argv[i + 1])
  return acc
}, [])

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
    // Bibliotecas NOVAS precisam vir junto uma vez. `_internal/app` é só o
    // nosso código: uma dependência que passou a existir mora ao lado dele e
    // ficaria de fora para sempre. Foi o caso do onnxruntime na 1.9.0 — sem
    // isto o CCIP diria "indisponível" na máquina do usuário e em nenhuma
    // outra, o que é o pior tipo de bug pra achar.
    for (const extra of ENGINE_EXTRAS) {
      const from = join(ENGINE_DIST, '_internal', extra)
      if (!existsSync(from)) {
        fail(`--engine-extra ${extra}: não achei ${from}`)
      }
      cpSync(from, join(dest, '_internal', extra), { recursive: true })
      log(`  + _internal/${extra}`)
    }
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

const instaladorPath = join(ROOT, 'release', `AnCut-HUB-${version}-Completo.exe`)
const temInstalador = existsSync(instaladorPath)

// O instalador completo entra na release quando existe. Anexá-lo à mão foi o
// que faltou nas versões anteriores, e é por isso que a página ficou só com
// pacotes de atualização — sem nada que uma pessoa nova pudesse instalar.
const assets = [
  manifestPath,
  ...Object.values(packages).map((p) => join(WORK, p.file)),
  ...(temInstalador ? [instaladorPath] : [])
]
if (temInstalador) {
  const gb = statSync(instaladorPath).size / 1024 ** 3
  log('')
  log(`instalador completo: ${gb.toFixed(2)} GiB (o limite do GitHub é 2 GiB)`)
  if (gb >= 2) fail('o instalador passou de 2 GiB — o GitHub vai recusar o anexo')
}

if (DRY) {
  log('')
  log('ensaio — nada foi publicado. Assets prontos em release/_publish/')
  process.exit(0)
}

/**
 * Aviso no TOPO de toda release, sempre.
 *
 * Custou um amigo do FAAH travado. Ele foi ao GitHub baixar "o app", achou
 * um `.zip` com `CorteCenas.exe` dentro, rodou, e levou "failed to start
 * embedded python interpreter".
 *
 * Ele não errou: a página não tinha nada instalável. Estes zips são pedaços
 * de ATUALIZAÇÃO — de propósito não levam Python, torch nem CUDA, porque
 * esses 5 GB já estão na máquina de quem tem o app. Avulsos, não rodam, e o
 * erro do carregador do PyInstaller não explica nada disso.
 *
 * O aviso mora aqui, e não no texto de cada versão, porque quem escreve as
 * notas está pensando no que mudou — não em quem vai chegar à página sem o
 * app instalado.
 */
/**
 * O instalador completo só é reconstruído quando o motor muda — a maioria
 * das versões é só interface. Então o aviso NÃO pode chutar um link:
 * `releases/latest/download/AnCut-HUB-<v>-Completo.exe` daria 404 em toda
 * release que não tivesse um, que é justamente quando alguém perdido mais
 * precisa dele.
 *
 * Se o .exe está em `release/`, ele sobe junto e o link aponta pra esta tag.
 * Se não está, o aviso manda pra lista de releases dizendo o que procurar.
 */
const REPO_URL = 'https://github.com/faahpla/ancut-hub'

const comoInstalar = temInstalador
  ? `> [\`AnCut-HUB-${version}-Completo.exe\`](${REPO_URL}/releases/download/v${version}/AnCut-HUB-${version}-Completo.exe) (~2 GB), aqui embaixo.`
  : `> Pegue o \`*-Completo.exe\` mais recente em **[Releases](${REPO_URL}/releases?q=Completo)**.` +
    ' Esta versão aqui não traz um: só o motor mudando exige instalador novo.'

const AVISO = [
  '> [!IMPORTANT]',
  '> **Primeira instalação? Você precisa do instalador completo.**',
  comoInstalar,
  '>',
  '> Os `.zip` desta página são pacotes de **atualização** — o app já instalado',
  '> os busca sozinho (Configurações → Procurar atualizações). Eles não trazem',
  '> o Python nem as bibliotecas de vídeo, então rodar o `CorteCenas.exe` de',
  '> dentro deles dá `failed to start embedded python interpreter`.',
  ''
].join('\n')

const notesPath = join(WORK, 'notes.md')
writeFileSync(notesPath, `${AVISO}\n${notes}\n`, 'utf-8')

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
