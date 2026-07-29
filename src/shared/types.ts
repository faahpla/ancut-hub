/**
 * Contrato de dados entre renderer, main e o sidecar Python.
 *
 * Só tipos — nada de valor de runtime aqui (isso fica em ./channels.ts, que
 * o preload importa). Os nomes dos campos espelham o que o Python já usa,
 * pra tradução ser 1:1 e não virar uma camada de adaptação escondida.
 */

import type { StageId } from './channels'

/** Presets de reconhecimento (iguais aos PRESETS de app/ui/analyze_tab.py). */
export type PresetKey = 'strict' | 'auto' | 'loose'

export interface MatchParams {
  threshold: number
  margin: number
  minShots: number
  padding: number
  credit: number
}

/**
 * O que este arquivo É dentro do anime.
 *
 * Não é enfeite de exibição: entra na IDENTIDADE do episódio. A abertura da
 * 2ª temporada não é o episódio 1 dela, e sem esta distinção as duas
 * dividiam a mesma vaga no banco — uma apagava as cenas da outra.
 */
export type EpisodeKind = '' | 'OP' | 'ED'

export interface AnalysisRequest {
  videoPath: string
  anime: string
  season: number
  episode: number
  kind: EpisodeKind
  outputDir: string
  /** Segundos de OP/ED a ignorar. */
  skipHeadSeconds: number
  skipTailSeconds: number
  params: MatchParams
  /** Manda os shots duvidosos pra IA desempatar. */
  aiReview: boolean
  /** Modo Descoberta: agrupa rostos e o usuário batiza. */
  discovery: boolean
  /** Reanálise: somar por cima em vez de substituir. */
  mergePrevious: boolean
  skipCreditShots: boolean
  useDanbooru: boolean
  renderExportMode: RenderExportMode
}

/**
 * Formato de saída dos clipes.
 *
 * Os dois níveis são separados de propósito, pra dar pra medir um sem o outro:
 *
 *   off     como sempre foi
 *   compat  8 bits + 23,976 CFR. H.264 High 10 não é decodificado por
 *           WebCodecs nem pelo NVDEC da maioria das placas, então clipe
 *           10-bit cai em decode por software no pipeline de render.
 *           Medido: custo de tamanho ~0% na GPU.
 *   intra   compat + todo frame é keyframe (seek quadro a quadro barato).
 *           Medido: 1,82x o tamanho.
 */
export type RenderExportMode = 'off' | 'compat' | 'intra'

// ---------------------------------------------------------------- eventos

/**
 * Progresso de uma etapa. `fraction` é 0..1, ou -1 quando indeterminado
 * (o Python usa essa convenção; mantida de propósito).
 */
export interface StageProgressEvent {
  type: 'stage'
  stage: StageId
  fraction: number
  message: string
  /** Segundos decorridos desde o início do run, medidos no Python. */
  elapsed: number
}

/** Linha de log solta (vai pro painel de detalhes, não pro status). */
export interface LogEvent {
  type: 'log'
  level: 'info' | 'warn' | 'error'
  message: string
}

/**
 * Telemetria por etapa, emitida no fim do run — é o que responde
 * "por que a análise demora tanto". Vem do StageTimer do Python, que já
 * grava o mesmo conteúdo em timings.json na pasta do episódio.
 */
export interface TimingsEvent {
  type: 'timings'
  totalSeconds: number
  /** stageId → segundos gastos. */
  stages: Partial<Record<StageId, number>>
}

export interface AnalysisResult {
  episodeRoot: string
  totalShots: number
  totalCharacters: number
  identifiedCharacters: string[]
  /** Aviso quando quase ninguém tinha referência utilizável. */
  lowRefsWarning?: string
  refsDir?: string
  /** Identifica o episódio recém-analisado pra abrir o resultado sozinho. */
  episodeId: number
  animeTitle: string
  season: number
  episode: number
  kind: EpisodeKind
}

export interface DoneEvent {
  type: 'done'
  result: AnalysisResult
}

export interface FailedEvent {
  type: 'failed'
  message: string
  /** Traceback completo, pro "mostrar detalhes". */
  detail?: string
}

export interface CancelledEvent {
  type: 'cancelled'
}

/**
 * Pedidos interativos: o pipeline para e espera uma decisão da interface.
 * No Qt eram QMessageBox no meio do worker; aqui viram evento + resposta.
 */
export interface NeedsInputEvent {
  type: 'needs-input'
  /** Correlaciona a resposta com o pedido. */
  requestId: string
  kind: 'refs-missing' | 'anime-not-found' | 'discovery-groups'
  message: string
  payload?: unknown
}

/** Um "personagem sem nome" achado pelo agrupamento de rostos. */
export interface DiscoveryGroup {
  key: number
  faces: number
  shots: number
  /** Recortes que virariam referência, relativos ao episodeRoot. O índice
   *  aqui é o mesmo que vai em `removed` no commit. */
  crops: string[]
  /** Palpite quando o anime já é conhecido ("parece a Eris"). */
  suggestedName: string
  suggestedSim: number
}

export interface DiscoveryReadyEvent {
  type: 'discovery-ready'
  episodeRoot: string
  animeTitle: string
  season: number
  episode: number
  totalFaces: number
  /** True quando o anime resolveu online — aí o elenco oficial vira sugestão. */
  online: boolean
  roster: string[]
  groups: DiscoveryGroup[]
}

export type AnalysisEvent =
  | StageProgressEvent
  | LogEvent
  | TimingsEvent
  | DoneEvent
  | FailedEvent
  | CancelledEvent
  | NeedsInputEvent
  | DiscoveryReadyEvent

// ------------------------------------------------------------- resultados

export interface RecentEpisode {
  episodeId: number
  animeTitle: string
  season: number
  episode: number
  kind: EpisodeKind
  episodeRoot: string
  shotCount: number
  processedAt: string | null
}

export interface CharacterSummary {
  id: number
  name: string
  shotCount: number
}

export interface EpisodeResults {
  episodeId: number
  animeTitle: string
  season: number
  episode: number
  kind: EpisodeKind
  episodeRoot: string
  totalShots: number
  characters: CharacterSummary[]
  /** Pasta de refs da FRANQUIA (todas as temporadas dividem a mesma). */
  refsDir?: string
}

export interface ShotRow {
  id: number
  idx: number
  /** Caminho do clipe, relativo ao episodeRoot. */
  file: string
  /** Caminho do keyframe, relativo ao episodeRoot. */
  keyframe: string | null
  start: number
  end: number
  duration: number
  /** Null na visão de todas as cenas: confiança pertence ao par
   *  (cena, personagem), e ali uma cena pode ter vários ou nenhum. */
  confidence: number | null
  approved: number | null
}

export interface MergeResult {
  shotId: number
  file: string
  mergedCount: number
  removed: number
  seconds: number
}

/** Progresso do reforço de refs: um evento por personagem. */
export interface HarvestProgress {
  type: 'harvest-progress'
  name: string
  done: number
  /** 0 enquanto os modelos carregam (ainda não dá pra saber o total). */
  total: number
}

export interface HarvestDone {
  type: 'harvest-done'
  /** nome do personagem → quantas refs entraram. */
  added: Record<string, number>
  total: number
  characters: number
  refsDir: string | null
}

export interface HarvestFailed {
  type: 'failed'
  message: string
}

export type HarvestEvent = HarvestProgress | HarvestDone | HarvestFailed

export interface DeleteResult {
  deletedCount: number
  /** Arquivos removidos do disco: clipe + hardlinks + keyframe. */
  files: number
}

// -------------------------------------------------------------- settings

export interface AppSettings {
  outputDir: string
  lastAnime: string
  lastSeason: number
  lastEpisode: number
  preset: PresetKey
  params: MatchParams
  skipCreditShots: boolean
  useDanbooru: boolean
  renderExportMode: RenderExportMode
  navyaiApiKey: string
  navyaiModel: string
  navyaiBaseUrl: string
  geminiApiKey: string
  geminiModel: string
}

export interface AppInfo {
  version: string
  isPackaged: boolean
  /** Nome da GPU quando há CUDA; null = rodando em CPU. */
  gpuName: string | null
}

// ----------------------------------------------------------- atualização

/**
 * Um pacote baixável de uma versão. Os caminhos dentro do zip são relativos
 * à RAIZ DA INSTALAÇÃO, então extrair `ui` e `engine` na mesma pasta monta
 * uma árvore que o robocopy despeja por cima do que está instalado.
 */
export interface UpdatePackage {
  /** Nome do asset no release (a URL é montada a partir da tag). */
  file: string
  sha256: string
  size: number
}

/**
 * `manifest.json` publicado como asset do release. O app busca sempre em
 * .../releases/latest/download/manifest.json — essa URL redireciona pro
 * release mais novo sozinha, então não precisa da API (que tem limite de
 * 60 chamadas por hora sem autenticação).
 */
export interface UpdateManifest {
  version: string
  date: string
  notes: string
  packages: {
    /** A interface Electron. Sempre presente — pesa ~3 MB. */
    ui: UpdatePackage
    /** O motor Python. Só quando o código Python mudou (~45 MB). */
    engine?: UpdatePackage
  }
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  /** Esperando o usuário responder ao pedido de permissão do Windows. */
  | 'applying'
  | 'error'

export interface UpdateStatus {
  phase: UpdatePhase
  currentVersion: string
  /** Preenchido de 'available' em diante. */
  manifest: UpdateManifest | null
  /** Bytes durante o download; null fora dele. */
  progress: { received: number; total: number } | null
  error: string | null
  /** Falso em desenvolvimento: só o app instalado sabe se atualizar. */
  supported: boolean
}

export interface SkipRanges {
  skipHeadSeconds: number
  skipTailSeconds: number
}

export interface ParsedFilename extends SkipRanges {
  anime: string
  season: number
  episode: number
  kind: EpisodeKind
}

// ------------------------------------------------------- ponte do preload

export interface AnCutBridge {
  analysis: {
    start(req: AnalysisRequest): Promise<{ runId: string }>
    cancel(): Promise<void>
    /**
     * Fecha o Modo Descoberta com os nomes dados. `names` mapeia a chave do
     * grupo pro nome (vazio = ignorar o grupo); `removed` lista os índices de
     * recorte que o usuário tirou por não serem daquele personagem.
     */
    commitDiscovery(
      names: Record<number, string>,
      removed: Record<number, number[]>
    ): Promise<void>
    /** Assina o stream de eventos. Devolve a função de cancelar a assinatura. */
    onEvent(handler: (event: AnalysisEvent) => void): () => void
  }
  dialog: {
    pickVideo(): Promise<string | null>
    pickFolder(current?: string): Promise<string | null>
  }
  episode: {
    /** Deduz anime/temporada/episódio do nome do arquivo. */
    parseFilename(path: string): Promise<ParsedFilename | null>
    /** OP/ED salvos pra um anime. */
    skipRanges(anime: string): Promise<SkipRanges | null>
    /** Já existe resultado salvo? (decide o diálogo substituir/somar). */
    hasAnalysis(
      source: string,
      anime: string,
      season: number,
      episode: number,
      /** Abertura e episódio 1 são coisas diferentes — a pergunta muda. */
      kind: EpisodeKind
    ): Promise<boolean>
  }
  results: {
    /** Episódios já analisados, pra reabrir sem reprocessar. */
    recent(): Promise<RecentEpisode[]>
    load(episodeId: number): Promise<EpisodeResults | null>
    /** `characterId` 0 (ou negativo) traz TODAS as cenas do episódio. */
    shots(episodeId: number, characterId: number): Promise<ShotRow[]>
    /**
     * Junta as cenas num clipe só, em ordem cronológica. Os pedaços somem de
     * shots/ mas sobrevivem em by_character/ (são hardlinks pro mesmo
     * arquivo). Reencoda quando o episódio foi cortado pra render, pra não
     * desfazer a cadência constante na emenda.
     */
    merge(episodeId: number, shotIds: number[]): Promise<MergeResult | null>
    /**
     * Apaga as cenas DE VEZ: o clipe, os hardlinks em by_character/by_pair e
     * o keyframe. Sem volta — os hardlinks precisam ir junto, senão o arquivo
     * sobrevive escondido ocupando espaço sem aparecer em lugar nenhum.
     */
    remove(episodeId: number, shotIds: number[]): Promise<DeleteResult | null>
    /**
     * Reforça as refs do anime com os rostos deste episódio. Só adiciona —
     * nada é sobrescrito nem apagado do banco de referências.
     */
    harvest(episodeId: number): Promise<HarvestDone | null>
    onHarvestEvent(handler: (event: HarvestEvent) => void): () => void
    /**
     * Libera a pasta do episódio pro esquema media:// e devolve o prefixo de
     * URL. Sem isto o renderer não consegue exibir keyframe nem tocar clipe.
     */
    grantMedia(episodeRoot: string): Promise<string>
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  app: {
    info(): Promise<AppInfo>
  }
  update: {
    status(): Promise<UpdateStatus>
    /** Consulta o manifesto no GitHub. */
    check(): Promise<UpdateStatus>
    /** Baixa e valida os pacotes; não mexe na instalação ainda. */
    download(): Promise<UpdateStatus>
    /**
     * Aplica o que foi baixado: pede elevação, fecha o app e deixa o script
     * copiar por cima. Devolve false se o usuário recusar o UAC.
     */
    apply(): Promise<boolean>
    onEvent(handler: (status: UpdateStatus) => void): () => void
  }
  shell: {
    reveal(path: string): Promise<void>
    open(path: string): Promise<void>
    /**
     * Começa a arrastar arquivos pra FORA do app. Só funciona chamado de
     * dentro de um `dragstart` do DOM (é a mesma gesto de mouse que o Windows
     * já está acompanhando); `event.preventDefault()` antes, pra o arrasto
     * nativo substituir o do HTML.
     *
     * `icon` é o que o cursor carrega — o keyframe da cena, quando existe.
     */
    startDrag(files: string[], icon?: string | null): void
  }
  window: {
    minimize(): void
    maximizeToggle(): void
    close(): void
    /** Avisa quando a janela maximiza/restaura (troca o ícone do botão). */
    onMaximizedChanged(handler: (maximized: boolean) => void): () => void
  }
}
