import { create } from 'zustand'
import { STAGES, type StageId } from '@shared/channels'
import type {
  AnalysisEvent,
  AnalysisRequest,
  AnalysisResult,
  DiscoveryReadyEvent,
  MatchParams,
  NeedsInputEvent,
  PresetKey
} from '@shared/types'

export type RunStatus = 'idle' | 'running' | 'done' | 'failed' | 'cancelled'
export type StageStatus = 'pending' | 'active' | 'done'

export interface StageState {
  id: StageId
  label: string
  status: StageStatus
  /** 0..1, ou null quando indeterminado. */
  fraction: number | null
  message: string
  /** Segundos gastos, preenchido pelo evento `timings` no fim. */
  seconds?: number
}

/** Presets espelhando PRESETS de app/ui/analyze_tab.py. */
export const PRESETS: Record<
  PresetKey,
  { label: string; desc: string; params: MatchParams }
> = {
  strict: {
    label: 'Muito Fiel',
    desc: 'Máxima precisão, menos resultados',
    params: { threshold: 0.86, margin: 0.05, minShots: 8, padding: 0.25, credit: 0.5 }
  },
  auto: {
    label: 'Auto (recomendado)',
    desc: 'Melhor equilíbrio entre precisão e quantidade',
    params: { threshold: 0.8, margin: 0.03, minShots: 3, padding: 0.25, credit: 0.55 }
  },
  loose: {
    label: 'Pouco Fiel',
    desc: 'Mais resultados, menos precisão',
    params: { threshold: 0.74, margin: 0.02, minShots: 2, padding: 0.3, credit: 0.7 }
  }
}

function freshStages(): StageState[] {
  return STAGES.map((s) => ({
    id: s.id,
    label: s.label,
    status: 'pending' as StageStatus,
    fraction: null,
    message: ''
  }))
}

interface AnalysisState {
  status: RunStatus
  stages: StageState[]
  /** Progresso global 0..1, derivado da etapa atual. */
  overall: number
  statusText: string
  elapsed: number
  /** Estimativa suavizada de quanto falta, em segundos. Null antes de ter base. */
  eta: number | null
  result: AnalysisResult | null
  error: { message: string; detail?: string } | null
  timings: { totalSeconds: number; stages: Partial<Record<StageId, number>> } | null
  /** Pipeline parou esperando uma decisão (refs faltando, anime não achado). */
  needsInput: (NeedsInputEvent & { refsDir?: string }) | null
  /** Grupos do Modo Descoberta aguardando batismo. */
  discovery: DiscoveryReadyEvent | null
  /** Prefixo media:// da pasta do episódio, pra exibir os recortes. */
  discoveryMedia: string

  begin: () => void
  apply: (event: AnalysisEvent) => void
  dismissNeedsInput: () => void
  clearDiscovery: () => void
  reset: () => void
}

/**
 * Estado de uma execução. O cálculo de ETA vive aqui (e não no componente)
 * porque depende do histórico entre eventos — recalcular na renderização
 * faria o número pular a cada frame.
 */
export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  status: 'idle',
  stages: freshStages(),
  overall: 0,
  statusText: '',
  elapsed: 0,
  eta: null,
  result: null,
  error: null,
  timings: null,
  needsInput: null,
  discovery: null,
  discoveryMedia: '',

  begin: () =>
    set({
      status: 'running',
      stages: freshStages(),
      overall: 0,
      statusText: 'Iniciando...',
      elapsed: 0,
      eta: null,
      result: null,
      error: null,
      timings: null
    }),

  reset: () =>
    set({
      status: 'idle',
      stages: freshStages(),
      overall: 0,
      statusText: '',
      elapsed: 0,
      eta: null,
      result: null,
      error: null,
      timings: null
    }),

  apply: (event) => {
    switch (event.type) {
      case 'stage': {
        const idx = STAGES.findIndex((s) => s.id === event.stage)
        if (idx < 0) return
        // fraction === -1 significa "indeterminado" (convenção do Python).
        const frac = event.fraction >= 0 ? Math.min(1, event.fraction) : null
        const overall = (idx + (frac ?? 0.5)) / STAGES.length

        const stages = get().stages.map((s, i) => {
          if (i < idx) return { ...s, status: 'done' as StageStatus, fraction: 1 }
          if (i > idx) return { ...s, status: 'pending' as StageStatus }
          return {
            ...s,
            status: (frac === 1 ? 'done' : 'active') as StageStatus,
            fraction: frac,
            message: event.message
          }
        })

        // ETA só depois de progresso real e alguns segundos — antes disso a
        // extrapolação é chute e o número fica pulando na tela.
        let eta = get().eta
        if (overall >= 0.06 && event.elapsed > 12) {
          const remaining = event.elapsed / overall - event.elapsed
          eta = eta === null ? remaining : 0.85 * eta + 0.15 * remaining
        }

        set({
          stages,
          overall,
          statusText: event.message,
          elapsed: event.elapsed,
          eta
        })
        return
      }

      case 'timings':
        set({
          timings: { totalSeconds: event.totalSeconds, stages: event.stages },
          stages: get().stages.map((s) => ({ ...s, seconds: event.stages[s.id] }))
        })
        return

      case 'done':
        set({
          status: 'done',
          overall: 1,
          eta: null,
          result: event.result,
          statusText: `Concluído: ${event.result.totalShots} cenas, ${event.result.totalCharacters} personagens.`,
          stages: get().stages.map((s) => ({
            ...s,
            status: 'done' as StageStatus,
            fraction: 1
          }))
        })
        return

      case 'failed':
        set({
          status: 'failed',
          eta: null,
          error: { message: event.message, detail: event.detail },
          statusText: event.message
        })
        return

      case 'cancelled':
        set({
          status: 'cancelled',
          eta: null,
          statusText: 'Análise cancelada. Os clipes já cortados ficam em cache.'
        })
        return

      case 'discovery-ready':
        // Os grupos chegaram: o Python está PARADO esperando os nomes. A
        // interface segue "rodando" — cancelar aqui ainda aborta o run.
        set({
          discovery: event,
          statusText: `${event.groups.length} personagens descobertos — dê os nomes.`
        })
        // Libera a pasta pro esquema media://, senão os recortes dão 403.
        void window.ancut.results
          .grantMedia(event.episodeRoot)
          .then((prefix) => set({ discoveryMedia: prefix }))
        return

      case 'needs-input':
        // O pipeline parou: sai do estado "rodando" e deixa a interface
        // apresentar as saídas (abrir refs, Modo Descoberta).
        set({
          status: 'failed',
          eta: null,
          needsInput: event,
          statusText:
            event.kind === 'refs-missing'
              ? 'Análise parada: sem referências suficientes.'
              : 'Análise parada: anime não encontrado.'
        })
        return

      default:
        // 'log' ainda não tem destino na interface.
        return
    }
  },

  dismissNeedsInput: () => set({ needsInput: null }),
  clearDiscovery: () => set({ discovery: null, discoveryMedia: '' })
}))

/** Monta a requisição a partir do formulário. */
export function buildRequest(form: {
  videoPath: string
  anime: string
  season: number
  episode: number
  outputDir: string
  skipHeadSeconds: number
  skipTailSeconds: number
  params: MatchParams
  useDanbooru: boolean
  skipCreditShots: boolean
}): Omit<AnalysisRequest, 'aiReview' | 'discovery' | 'mergePrevious'> {
  return { ...form }
}
