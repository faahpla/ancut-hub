import { app, net } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { UpdateManifest, UpdatePackage, UpdateStatus } from '../../shared/types'

/**
 * Atualização automática via GitHub Releases.
 *
 * NÃO usamos o electron-updater. Ele só sabe atualizar app instalado pelo NSIS
 * dele, e o AnCut é instalado por Inno Setup (o pacote completo tem 2,1 GB e o
 * NSIS é 32-bit — não mapeia payload acima de ~2 GB). Trocar de instalador
 * criaria uma segunda entrada em "Adicionar ou remover programas", que é
 * exatamente o que não pode acontecer.
 *
 * Em troca, este updater atualiza as DUAS metades do app (interface Electron e
 * motor Python) num passo só, o que o electron-updater não faria de todo jeito.
 *
 * O que viaja pela rede é delta, não o pacote inteiro:
 *
 *   interface  resources/app.asar        ~3 MB    muda toda hora
 *   motor      engine/CorteCenas.exe     ~45 MB   muda às vezes
 *   torch/CUDA/Chromium                  ~5 GB    fica onde está
 */

/** Repositório público que hospeda os releases. */
const REPO = 'faahpla/ancut-hub'

/**
 * Essa URL redireciona sozinha pro asset do release mais novo. Usar isto em
 * vez da API evita o limite de 60 requisições/hora que o GitHub impõe a
 * chamadas sem autenticação — e o app não precisa de token nenhum.
 */
const MANIFEST_URL = `https://github.com/${REPO}/releases/latest/download/manifest.json`

const assetUrl = (version: string, file: string): string =>
  `https://github.com/${REPO}/releases/download/v${version}/${file}`

/** Espera até 10s pela resposta. Sem isto, uma rede ruim trava o "checando". */
const FETCH_TIMEOUT_MS = 10_000

export class UpdateService {
  private status: UpdateStatus
  private busy = false

  constructor(
    private readonly emit: (status: UpdateStatus) => void,
    /** Bloqueia a aplicação enquanto uma análise estiver rodando. */
    private readonly isEngineBusy: () => boolean
  ) {
    this.status = {
      phase: 'idle',
      currentVersion: app.getVersion(),
      manifest: null,
      progress: null,
      error: null,
      // Em dev o app roda de out/ pelo electron-vite: não há instalação pra
      // sobrescrever, e copiar por cima só quebraria o ambiente de trabalho.
      supported: app.isPackaged && process.platform === 'win32'
    }
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  private set(patch: Partial<UpdateStatus>): UpdateStatus {
    this.status = { ...this.status, ...patch }
    this.emit(this.status)
    return this.status
  }

  // ------------------------------------------------------------- consulta

  async check(): Promise<UpdateStatus> {
    if (this.busy) return this.status
    this.busy = true
    this.set({ phase: 'checking', error: null, progress: null })
    try {
      const manifest = await this.fetchManifest()
      if (!isNewer(manifest.version, this.status.currentVersion)) {
        return this.set({ phase: 'up-to-date', manifest: null })
      }
      // Um download interrompido antes de aplicar não se perde: se o payload
      // desta versão já está pronto no disco, pula direto pro fim.
      const ready = await this.isStaged(manifest.version)
      return this.set({ phase: ready ? 'ready' : 'available', manifest })
    } catch (err) {
      return this.set({ phase: 'error', error: describe(err) })
    } finally {
      this.busy = false
    }
  }

  private async fetchManifest(): Promise<UpdateManifest> {
    // O `?t=` evita cache: sem ele, um manifesto guardado pelo Chromium ou
    // por um proxy esconderia o release novo justamente na hora de achá-lo.
    const res = await withTimeout(
      net.fetch(`${MANIFEST_URL}?t=${Date.now()}`),
      FETCH_TIMEOUT_MS
    )
    if (!res.ok) throw new Error(`o GitHub respondeu ${res.status}`)
    const manifest = (await res.json()) as UpdateManifest
    if (!manifest?.version || !manifest?.packages?.ui) {
      throw new Error('manifesto do release veio incompleto')
    }
    return manifest
  }

  // ------------------------------------------------------------ download

  async download(): Promise<UpdateStatus> {
    const manifest = this.status.manifest
    if (!manifest || this.busy) return this.status
    if (this.status.phase === 'ready') return this.status

    this.busy = true
    const stage = this.stageDir(manifest.version)
    const payload = join(stage, 'payload')
    try {
      await rm(stage, { recursive: true, force: true })
      await mkdir(payload, { recursive: true })

      const parts = [manifest.packages.ui, manifest.packages.engine].filter(
        (p): p is UpdatePackage => Boolean(p)
      )
      const total = parts.reduce((sum, p) => sum + p.size, 0)
      let done = 0

      this.set({ phase: 'downloading', progress: { received: 0, total }, error: null })

      for (const part of parts) {
        const zip = join(stage, part.file)
        await this.downloadVerified(assetUrl(manifest.version, part.file), zip, part, (n) =>
          this.set({ progress: { received: done + n, total } })
        )
        done += part.size
        await expandArchive(zip, payload)
        await rm(zip, { force: true })
      }

      // O marcador só entra depois de tudo baixado, conferido e extraído —
      // é ele que autoriza pular o download numa próxima abertura.
      await writeFile(join(stage, '.ready'), manifest.version, 'utf-8')
      await this.pruneOldStages(manifest.version)
      return this.set({ phase: 'ready', progress: null })
    } catch (err) {
      await rm(stage, { recursive: true, force: true }).catch(() => undefined)
      return this.set({ phase: 'error', progress: null, error: describe(err) })
    } finally {
      this.busy = false
    }
  }

  /**
   * Baixa conferindo o SHA-256. Isto não é zelo excessivo: o conteúdo vira
   * executável rodando na máquina do usuário logo depois, então um arquivo
   * truncado ou trocado no caminho não pode chegar até a instalação.
   */
  private async downloadVerified(
    url: string,
    dest: string,
    expected: UpdatePackage,
    onProgress: (received: number) => void
  ): Promise<void> {
    const res = await withTimeout(net.fetch(url), FETCH_TIMEOUT_MS)
    if (!res.ok) throw new Error(`falha ao baixar ${expected.file} (HTTP ${res.status})`)
    if (!res.body) throw new Error(`resposta vazia ao baixar ${expected.file}`)

    const out = createWriteStream(dest)
    const hash = createHash('sha256')
    const reader = res.body.getReader()
    let received = 0

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        hash.update(value)
        // write() devolvendo false significa buffer cheio: sem esperar o
        // 'drain' um asset grande cresceria em memória em vez de no disco.
        if (!out.write(Buffer.from(value))) {
          await new Promise<void>((resolve) => out.once('drain', resolve))
        }
        received += value.length
        onProgress(received)
      }
    } finally {
      await new Promise<void>((resolve) => out.end(resolve))
    }

    const got = hash.digest('hex')
    if (got !== expected.sha256.toLowerCase()) {
      throw new Error(`${expected.file} chegou corrompido (assinatura não confere)`)
    }
  }

  // ------------------------------------------------------------- aplicar

  /**
   * Devolve false quando o usuário recusa o UAC — o app segue aberto e nada
   * é tocado. A ordem importa: só saímos DEPOIS de confirmar que o processo
   * elevado subiu, senão o app fecharia e a atualização não aconteceria.
   */
  async apply(): Promise<boolean> {
    const manifest = this.status.manifest
    if (!manifest || this.status.phase !== 'ready' || !this.status.supported) return false
    if (this.isEngineBusy()) {
      this.set({ phase: 'error', error: 'Termine ou cancele a análise antes de atualizar.' })
      return false
    }

    const installRoot = dirname(app.getPath('exe'))
    const stage = this.stageDir(manifest.version)
    const payload = join(stage, 'payload')

    // O script vem de dentro do asar — copiar pra fora é obrigatório: o
    // PowerShell não executa arquivo de dentro do pacote, e mesmo que
    // executasse ele seria justamente um dos arquivos sobrescritos.
    const applyScript = join(stage, 'apply-update.ps1')
    await copyFile(join(__dirname, '../../resources/apply-update.ps1'), applyScript)

    // Os parâmetros vão embutidos num script gerado em vez de irem como
    // argumentos. Atravessar a fronteira de elevação são DOIS níveis de
    // aspas (Start-Process -ArgumentList, depois powershell -File), e
    // "C:\Program Files\AnCut HUB" tem espaço: assim sobra um caminho só
    // pra escapar, o do próprio script.
    const runScript = join(stage, 'run-update.ps1')
    await writeFile(
      runScript,
      [
        '# Gerado pelo AnCut HUB a cada atualizacao. Nao editar.',
        "$ErrorActionPreference = 'Continue'",
        `& (Join-Path $PSScriptRoot 'apply-update.ps1')` +
          ` -Source ${psLiteral(payload)}` +
          ` -Install ${psLiteral(installRoot)}` +
          ` -Exe 'AnCut HUB.exe'`,
        ''
      ].join('\n'),
      'utf-8'
    )

    const elevated = await runElevated(runScript)
    if (!elevated) {
      this.set({ phase: 'ready', error: 'Atualização cancelada — o Windows não deu permissão.' })
      return false
    }

    // O script elevado espera o app sair antes de copiar; sair agora é o
    // que libera os arquivos pra ele.
    setTimeout(() => app.quit(), 300)
    return true
  }

  // --------------------------------------------------------------- disco

  private stageDir(version: string): string {
    return join(app.getPath('userData'), 'updates', version)
  }

  private async isStaged(version: string): Promise<boolean> {
    try {
      const entries = await readdir(this.stageDir(version))
      return entries.includes('.ready')
    } catch {
      return false
    }
  }

  /** Payload baixado pesa dezenas de MB; guardar versões vencidas é lixo. */
  private async pruneOldStages(keep: string): Promise<void> {
    const root = join(app.getPath('userData'), 'updates')
    try {
      for (const name of await readdir(root)) {
        if (name !== keep) await rm(join(root, name), { recursive: true, force: true })
      }
    } catch {
      /* pasta ainda não existe — nada a limpar */
    }
  }
}

// ------------------------------------------------------------- utilidades

/** Compara `1.10.0` > `1.9.3` numericamente (comparar texto erraria isso). */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0)
  const a = parse(candidate)
  const b = parse(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

/** Texto entre aspas simples do PowerShell — apóstrofo se escapa dobrando. */
function psLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('o GitHub não respondeu a tempo')), ms)
    )
  ])
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function runPowerShell(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], {
      windowsHide: true
    })
    child.on('error', () => resolve(-1))
    child.on('close', (code) => resolve(code ?? -1))
  })
}

async function expandArchive(zip: string, dest: string): Promise<void> {
  const code = await runPowerShell([
    '-Command',
    `Expand-Archive -Path ${psLiteral(zip)} -DestinationPath ${psLiteral(dest)} -Force`
  ])
  if (code !== 0) throw new Error(`não deu pra extrair ${zip} (código ${code})`)
}

/**
 * Sobe o script pedindo elevação. O PowerShell de fora não é elevado: ele só
 * dispara o UAC e sai. Código 0 = o usuário aceitou e o processo elevado está
 * de pé; qualquer outra coisa = recusou.
 */
async function runElevated(script: string): Promise<boolean> {
  const inner = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `"${script}"`]
    .map(psLiteral)
    .join(',')
  const code = await runPowerShell([
    '-Command',
    `try { Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden ` +
      `-ArgumentList ${inner} -ErrorAction Stop } catch { exit 1 }`
  ])
  return code === 0
}
