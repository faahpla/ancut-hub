import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type {
  AnalysisEvent,
  AnalysisRequest,
  DeleteResult,
  EpisodeResults,
  MergeResult,
  RecentEpisode,
  ShotRow
} from '../../shared/types'

/**
 * Sobe o pipeline Python como processo filho e traduz o stream JSON-lines
 * dele em eventos pro renderer.
 *
 * O Python continua sendo o motor (torch/CUDA, CLIP, YOLO): nada disso migra
 * pro Node. O Electron é só a fachada.
 */

export interface BackendLocation {
  cmd: string
  args: string[]
  cwd: string
  /** De onde veio — aparece na mensagem de erro quando nada é encontrado. */
  origin: string
}

/**
 * Onde mora o backend Python, em ordem de preferência.
 *
 * O backend NÃO é embutido nesta aplicação de propósito. Ele pesa 4,8 GB
 * (torch + CUDA) e o NSIS é 32-bit: não consegue mapear um pacote acima de
 * ~2 GB, então o instalador simplesmente não compila com ele dentro.
 *
 * A separação também é melhor à parte disso: atualizar a interface passa a
 * custar ~100 MB em vez de 2 GB, já que o motor pesado só é instalado uma vez
 * (pelo instalador do app Qt, que usa Inno Setup e aguenta o tamanho).
 */
function resolveBackend(): BackendLocation | null {
  const tryExe = (exe: string, origin: string): BackendLocation | null =>
    existsSync(exe)
      ? { cmd: exe, args: ['--headless'], cwd: dirname(exe), origin }
      : null

  // 1) Override explícito — aponta pra qualquer instalação.
  const override = process.env['ANCUT_BACKEND']
  if (override && existsSync(override)) {
    return { cmd: override, args: ['--headless'], cwd: dirname(override), origin: 'ANCUT_BACKEND' }
  }

  // 2) Instalador único: o motor fica em engine\, irmão do executável da
  //    interface. É o caminho normal do app instalado.
  if (app.isPackaged) {
    const appDir = dirname(app.getPath('exe'))
    const engine = tryExe(join(appDir, 'engine', 'CorteCenas.exe'), 'motor embutido')
    if (engine) return engine
    // Compatibilidade com o empacotamento antigo (extraResources).
    const legacy = tryExe(
      join(process.resourcesPath, 'backend', 'CorteCenas.exe'),
      'recurso empacotado'
    )
    if (legacy) return legacy
  }

  // 3) Instalação do app Qt — o caso normal do app empacotado.
  const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files'
  const localApps = join(
    process.env['LOCALAPPDATA'] ?? '',
    'Programs'
  )
  for (const [base, label] of [
    [join(programFiles, 'AnCut HUB'), 'AnCut HUB instalado'],
    [join(programFiles, 'CorteCenas'), 'Corte Cenas instalado'],
    [join(localApps, 'AnCut HUB'), 'AnCut HUB (por usuário)'],
    [join(localApps, 'CorteCenas'), 'Corte Cenas (por usuário)']
  ]) {
    const hit = tryExe(join(base, 'CorteCenas.exe'), label)
    if (hit) return hit
  }

  // 4) Dev: o venv do projeto Qt. Roda o módulo direto, então alterações no
  //    Python valem na hora, sem reempacotar.
  const repo = 'D:\\FAAH\\AnCut HUB'
  const venvPy = join(repo, '.venv', 'Scripts', 'python.exe')
  if (existsSync(venvPy)) {
    return { cmd: venvPy, args: ['-m', 'app.headless'], cwd: repo, origin: 'venv de dev' }
  }

  // 5) Build direto do PyInstaller, sem instalar.
  const distExe = join(repo, 'dist', 'CorteCenas', 'CorteCenas.exe')
  return tryExe(distExe, 'dist local')
}

const BACKEND_MISSING =
  'Motor de análise não encontrado. O AnCut HUB usa o mesmo backend do app ' +
  'original: instale o AnCut HUB (versão Qt) ou aponte a variável ' +
  'ANCUT_BACKEND para o CorteCenas.exe.'

/** Converte a requisição da UI no JSON que o app.headless espera. */
function toWireRequest(req: AnalysisRequest): Record<string, unknown> {
  return {
    videoPath: req.videoPath,
    anime: req.anime,
    season: req.season,
    episode: req.episode,
    outputDir: req.outputDir,
    skipHeadSeconds: req.skipHeadSeconds,
    skipTailSeconds: req.skipTailSeconds,
    params: {
      threshold: req.params.threshold,
      margin: req.params.margin,
      minShots: req.params.minShots,
      padding: req.params.padding,
      credit: req.params.credit
    },
    aiReview: req.aiReview,
    discovery: req.discovery,
    mergePrevious: req.mergePrevious,
    skipCreditShots: req.skipCreditShots,
    useDanbooru: req.useDanbooru,
    renderExportMode: req.renderExportMode
  }
}

/**
 * Lê um stream de JSON-lines respeitando fronteiras de linha.
 *
 * O chunk que chega do pipe NÃO é uma linha: pode vir cortado no meio de um
 * objeto ou trazer três de uma vez. Sem este buffer o JSON.parse quebra em
 * runs longos — e quebraria justo nos eventos mais compridos.
 */
class LineReader {
  private buffer = ''

  constructor(private readonly onLine: (line: string) => void) {}

  push(chunk: string): void {
    this.buffer += chunk
    let idx = this.buffer.indexOf('\n')
    while (idx >= 0) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (line) this.onLine(line)
      idx = this.buffer.indexOf('\n')
    }
  }

  flush(): void {
    const line = this.buffer.trim()
    this.buffer = ''
    if (line) this.onLine(line)
  }
}

export interface ProbeInfo {
  version: string
  gpuName: string | null
  ffmpeg: boolean
}

export interface ParsedFilename {
  anime: string
  season: number
  episode: number
  skipHeadSeconds: number
  skipTailSeconds: number
}

export class PythonService {
  private current: ChildProcessWithoutNullStreams | null = null
  private probeCache: ProbeInfo | null = null

  constructor(private readonly emit: (event: AnalysisEvent) => void) {}

  get running(): boolean {
    return this.current !== null
  }

  /**
   * Roda um subcomando de tiro curto e devolve o primeiro evento do tipo
   * esperado. Usado pelas consultas leves (probe, parse, skip-ranges) — todas
   * terminam em menos de 1s, exceto o probe (~4s, por causa do import do torch).
   */
  private runOneShot<T>(args: string[], expectType: string): Promise<T | null> {
    const backend = resolveBackend()
    if (!backend) return Promise.resolve(null)

    return new Promise<T | null>((resolvePromise) => {
      let out = ''
      let settled = false
      const done = (value: T | null): void => {
        if (settled) return
        settled = true
        resolvePromise(value)
      }

      const child = spawn(backend.cmd, [...backend.args, ...args], {
        cwd: backend.cwd,
        windowsHide: true
      })
      child.stdout.on('data', (d: Buffer) => {
        out += d.toString('utf-8')
      })
      child.on('error', () => done(null))
      child.on('close', () => {
        for (const line of out.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const parsed = JSON.parse(trimmed) as { type?: string }
            if (parsed.type === expectType) {
              done(parsed as T)
              return
            }
          } catch {
            /* linha não-JSON: ignora */
          }
        }
        done(null)
      })

      // Rede de segurança: se o backend travar, não deixamos a promise
      // pendurada pra sempre (a interface ficaria esperando sem timeout).
      setTimeout(() => {
        if (!settled) {
          child.kill()
          done(null)
        }
      }, 30_000)
    })
  }

  /** Info de ambiente (versão, GPU, ffmpeg). Cacheada — o probe custa ~4s. */
  async probe(): Promise<ProbeInfo | null> {
    if (this.probeCache) return this.probeCache
    const info = await this.runOneShot<ProbeInfo & { type: string }>(['probe'], 'probe')
    if (info) {
      this.probeCache = {
        version: info.version,
        gpuName: info.gpuName ?? null,
        ffmpeg: info.ffmpeg
      }
    }
    return this.probeCache
  }

  /** Deduz anime/temporada/episódio do nome do arquivo (heurística do Python). */
  parseFilename(path: string): Promise<ParsedFilename | null> {
    return this.runOneShot<ParsedFilename & { type: string }>(['parse', path], 'parsed')
  }

  /** OP/ED salvos pra um anime. */
  skipRanges(
    anime: string
  ): Promise<{ skipHeadSeconds: number; skipTailSeconds: number } | null> {
    return this.runOneShot(['skip-ranges', anime], 'skip-ranges')
  }

  /** Este episódio já tem resultado salvo? */
  async hasAnalysis(
    source: string,
    anime: string,
    season: number,
    episode: number
  ): Promise<boolean> {
    const r = await this.runOneShot<{ exists: boolean }>(
      ['has-analysis', source, anime, String(season), String(episode)],
      'has-analysis'
    )
    return r?.exists ?? false
  }

  /** Episódios já analisados (o backend preenche a pasta que faltava). */
  async recentEpisodes(): Promise<RecentEpisode[]> {
    const r = await this.runOneShot<{ episodes: RecentEpisode[] }>(['recent'], 'recent')
    return r?.episodes ?? []
  }

  mergeShots(episodeId: number, shotIds: number[]): Promise<MergeResult | null> {
    return this.runOneShot<MergeResult & { type: string }>(
      ['merge', String(episodeId), ...shotIds.map(String)],
      'merged'
    )
  }

  deleteShots(episodeId: number, shotIds: number[]): Promise<DeleteResult | null> {
    return this.runOneShot<DeleteResult & { type: string }>(
      ['delete', String(episodeId), ...shotIds.map(String)],
      'deleted'
    )
  }

  loadResults(episodeId: number): Promise<EpisodeResults | null> {
    return this.runOneShot<EpisodeResults & { type: string }>(
      ['results', String(episodeId)],
      'results'
    )
  }

  async loadShots(episodeId: number, characterId: number): Promise<ShotRow[]> {
    const r = await this.runOneShot<{ shots: ShotRow[] }>(
      ['shots', String(episodeId), String(characterId)],
      'shots'
    )
    return r?.shots ?? []
  }

  start(req: AnalysisRequest): string {
    if (this.current) throw new Error('Já existe uma análise em andamento.')

    const backend = resolveBackend()
    if (!backend) throw new Error(BACKEND_MISSING)

    const runId = `run-${Date.now()}`
    const child = spawn(backend.cmd, [...backend.args, 'run'], {
      cwd: backend.cwd,
      windowsHide: true
    })
    this.current = child

    const reader = new LineReader((line) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        // Contaminação do canal — não deveria acontecer (o headless manda
        // todo print pro stderr), mas registrar é melhor que engolir.
        console.error('[python] linha não-JSON no canal de eventos:', line.slice(0, 200))
        return
      }
      this.emit(parsed as AnalysisEvent)
    })

    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (chunk: string) => reader.push(chunk))

    // stderr é log humano do pipeline — vai pro terminal, não pra interface.
    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (chunk: string) => {
      process.stderr.write(chunk)
    })

    child.on('error', (err) => {
      this.emit({ type: 'failed', message: `Falha ao iniciar o backend: ${err.message}` })
      this.current = null
    })

    child.on('close', (code) => {
      reader.flush()
      // Saída não-zero sem ter emitido um evento terminal = morte anormal
      // (crash, OOM, processo morto por fora). Sem isto a interface ficaria
      // girando pra sempre esperando um "done" que nunca vem.
      if (code !== 0 && code !== null) {
        this.emit({
          type: 'failed',
          message: `O backend encerrou inesperadamente (código ${code}).`
        })
      }
      this.current = null
    })

    child.stdin.write(JSON.stringify(toWireRequest(req)) + '\n')
    return runId
  }

  /**
   * Cancelamento cooperativo: o Python para na próxima fronteira de etapa.
   * Pode levar alguns segundos — um corte de ffmpeg ou chamada de API em voo
   * termina antes.
   */
  cancel(): void {
    if (!this.current) return
    try {
      this.current.stdin.write(JSON.stringify({ cmd: 'cancel' }) + '\n')
    } catch {
      // stdin já fechado: mata direto.
      this.current.kill()
    }
  }

  /**
   * Envia os nomes do batismo. O processo da descoberta ficou vivo esperando
   * este comando — o resultado carrega bytes de imagem e embeddings que não
   * sobreviveriam a uma ida e volta ao disco.
   */
  commitDiscovery(
    names: Record<number, string>,
    removed: Record<number, number[]>
  ): void {
    if (!this.current) {
      throw new Error(
        'A descoberta não está mais ativa. Rode o Modo Descoberta de novo.'
      )
    }
    this.current.stdin.write(
      JSON.stringify({ cmd: 'commit-discovery', names, removed }) + '\n'
    )
  }

  /** Encerra o filho ao fechar o app — senão ele fica órfão segurando a GPU. */
  dispose(): void {
    if (!this.current) return
    this.current.kill()
    this.current = null
  }
}
