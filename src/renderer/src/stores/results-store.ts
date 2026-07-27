import { create } from 'zustand'
import type {
  CharacterSummary,
  EpisodeResults,
  RecentEpisode,
  ShotRow
} from '@shared/types'

interface ResultsState {
  recent: RecentEpisode[]
  loadingRecent: boolean

  results: EpisodeResults | null
  /** Prefixo media:// da pasta do episódio — vazio até liberar a raiz. */
  mediaPrefix: string
  selectedCharacter: CharacterSummary | null
  shots: ShotRow[]
  loadingShots: boolean
  /** Cena mostrada no player. */
  activeShot: ShotRow | null
  /** Largura do card na grade, em px (o controle de escala). */
  cardWidth: number

  loadRecent: () => Promise<void>
  openEpisode: (episodeId: number) => Promise<void>
  selectCharacter: (character: CharacterSummary) => Promise<void>
  setActiveShot: (shot: ShotRow | null) => void
  setCardWidth: (w: number) => void
  close: () => void
}

export const useResultsStore = create<ResultsState>((set, get) => ({
  recent: [],
  loadingRecent: false,
  results: null,
  mediaPrefix: '',
  selectedCharacter: null,
  shots: [],
  loadingShots: false,
  activeShot: null,
  // 180px cabe em 3 colunas na largura padrão da janela. Acima disso a grade
  // cai pra 2 e a revisão fica lenta — o pedido original era "3 ou mais".
  cardWidth: 180,

  loadRecent: async () => {
    set({ loadingRecent: true })
    try {
      set({ recent: await window.ancut.results.recent() })
    } finally {
      set({ loadingRecent: false })
    }
  },

  openEpisode: async (episodeId) => {
    const results = await window.ancut.results.load(episodeId)
    if (!results) return
    // Libera a pasta pro esquema media:// ANTES de renderizar: sem isso os
    // <img> disparam e levam 403.
    const mediaPrefix = await window.ancut.results.grantMedia(results.episodeRoot)
    set({
      results,
      mediaPrefix,
      selectedCharacter: null,
      shots: [],
      activeShot: null
    })
    const first = results.characters[0]
    if (first) await get().selectCharacter(first)
  },

  selectCharacter: async (character) => {
    const results = get().results
    if (!results) return
    set({ selectedCharacter: character, loadingShots: true, activeShot: null })
    try {
      const shots = await window.ancut.results.shots(results.episodeId, character.id)
      // Só aplica se o usuário não trocou de personagem no meio do caminho —
      // senão uma resposta lenta sobrescreve a seleção nova.
      if (get().selectedCharacter?.id !== character.id) return
      set({ shots, activeShot: shots[0] ?? null })
    } finally {
      if (get().selectedCharacter?.id === character.id) set({ loadingShots: false })
    }
  },

  setActiveShot: (shot) => set({ activeShot: shot }),
  setCardWidth: (w) => set({ cardWidth: w }),

  close: () =>
    set({
      results: null,
      mediaPrefix: '',
      selectedCharacter: null,
      shots: [],
      activeShot: null
    })
}))

/** Monta a URL media:// de um caminho relativo dentro do episódio. */
export function mediaUrl(prefix: string, relative: string | null): string | null {
  if (!prefix || !relative) return null
  return prefix + encodeURIComponent(relative)
}
