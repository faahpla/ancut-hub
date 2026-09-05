import { create } from 'zustand'
import type {
  MediaKind, EpisodeKind, MatchParams, PresetKey, RenderExportMode } from '@shared/types'
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
  /** '' = episódio, 'OP' = abertura, 'ED' = encerramento. */
  kind: EpisodeKind
  outputDir: string
  /**
   * Subpasta do anime dentro de `outputDir`. Quem responde é o motor: ele
   * guarda a pasta já combinada pra cada jeito de escrever o nome. Vazio
   * enquanto ninguém digitou nada.
   */
  animeFolder: string
  /** true = a pasta veio de uma escolha guardada, não do nome digitado. */
  folderRemembered: boolean
  /** Pastas de anime que já existem na saída — sugestão do campo. */
  existingFolders: string[]
  /** Guardados como texto "mm:ss" — é o que o usuário digita. */
  skipHead: string
  skipTail: string
  preset: PresetKey
  params: MatchParams
  useDanbooru: boolean
  /** Anime ou live action — decide quem reconhece o rosto e de onde vem o
   *  elenco. Fica no formulário porque muda por MÍDIA, não por gosto. */
  mediaKind: MediaKind
  skipCreditShots: boolean
  renderExportMode: RenderExportMode
  hydrated: boolean

  set: (patch: Partial<EpisodeState>) => void
  choosePreset: (key: PresetKey) => void
  /** Preenche a partir de um arquivo escolhido/arrastado. */
  applyFile: (path: string) => Promise<void>
  /** Pergunta ao motor em que pasta o nome atual cairia. */
  refreshFolder: () => Promise<void>
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
  kind: '',
  outputDir: '',
  animeFolder: '',
  folderRemembered: false,
  existingFolders: [],
  skipHead: '',
  skipTail: '',
  preset: 'auto',
  params: PRESETS.auto.params,
  useDanbooru: false,
  mediaKind: 'anime',
  skipCreditShots: false,
  renderExportMode: 'off',
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
      // O motor reconhece NCOP/NCED no nome do arquivo, então arrastar uma
      // abertura já marca o tipo — sem depender de o usuário lembrar.
      kind: parsed.kind,
      // Os campos de pular dizem ONDE a abertura fica DENTRO de um episódio.
      // Num arquivo que É a abertura eles não significam nada — preencher com
      // o 01:30 salvo do anime cortaria o arquivo inteiro e não sobraria cena
      // nenhuma. Ficam vazios, mas seguem editáveis: quem manda é você.
      skipHead: parsed.kind ? '' : formatMmss(parsed.skipHeadSeconds),
      skipTail: parsed.kind ? '' : formatMmss(parsed.skipTailSeconds)
    })
    await get().refreshFolder()
  },

  refreshFolder: async () => {
    const anime = get().anime.trim()
    if (!anime) {
      set({ animeFolder: '', folderRemembered: false })
      return
    }
    const r = await window.ancut.episode.animeFolder(anime)
    if (!r) return
    // Corrida: se o nome mudou enquanto a resposta vinha, ela é de outro
    // anime e não pode sobrescrever o campo.
    if (get().anime.trim() !== anime) return
    set({
      animeFolder: r.folder,
      folderRemembered: r.remembered,
      existingFolders: r.existing
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
      mediaKind: s.mediaKind,
      renderExportMode: s.renderExportMode,
      hydrated: true
    })
  }
}))
