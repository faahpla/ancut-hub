import { create } from 'zustand'
import type { MatchParams, PresetKey } from '@shared/types'
import { PRESETS } from './analysis-store'

/**
 * Estado do formulário do episódio.
 *
 * Vive num store, e não no componente, porque a aba desmonta ao trocar pra
 * Resultados — no estado local o usuário perderia tudo que digitou só de
 * dar uma olhada no outro lado.
 */
interface EpisodeState {
  videoPath: string
  anime: string
  season: number
  episode: number
  outputDir: string
  /** Guardados como texto "mm:ss" — é o que o usuário digita. */
  skipHead: string
  skipTail: string
  preset: PresetKey
  params: MatchParams
  useDanbooru: boolean
  skipCreditShots: boolean
  hydrated: boolean

  set: (patch: Partial<EpisodeState>) => void
  choosePreset: (key: PresetKey) => void
  /** Preenche a partir de um arquivo escolhido/arrastado. */
  applyFile: (path: string) => Promise<void>
  hydrate: () => Promise<void>
}

/** "01:30" → 90. Aceita também segundos puros ("90"). */
export function parseMmss(text: string): number {
  const t = text.trim()
  if (!t) return 0
  const parts = t.split(':')
  if (parts.length === 1) return Math.max(0, Number(parts[0]) || 0)
  const m = Number(parts[0]) || 0
  const s = Number(parts[1]) || 0
  return Math.max(0, m * 60 + s)
}

/** 90 → "01:30". Zero vira string vazia (campo em branco lê melhor). */
export function formatMmss(seconds: number): string {
  if (!seconds || seconds <= 0) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const useEpisodeStore = create<EpisodeState>((set, get) => ({
  videoPath: '',
  anime: '',
  season: 1,
  episode: 1,
  outputDir: '',
  skipHead: '',
  skipTail: '',
  preset: 'auto',
  params: PRESETS.auto.params,
  useDanbooru: false,
  skipCreditShots: false,
  hydrated: false,

  set: (patch) => set(patch),

  choosePreset: (key) => set({ preset: key, params: PRESETS[key].params }),

  applyFile: async (path) => {
    set({ videoPath: path })
    const parsed = await window.ancut.episode.parseFilename(path)
    if (!parsed) return
    set({
      anime: parsed.anime,
      season: parsed.season,
      episode: parsed.episode,
      skipHead: formatMmss(parsed.skipHeadSeconds),
      skipTail: formatMmss(parsed.skipTailSeconds)
    })
  },

  hydrate: async () => {
    if (get().hydrated) return
    const s = await window.ancut.settings.get()
    set({
      outputDir: s.outputDir,
      season: s.lastSeason,
      episode: s.lastEpisode,
      preset: s.preset,
      params: s.params,
      useDanbooru: s.useDanbooru,
      hydrated: true
    })
  }
}))
