import { create } from 'zustand'
import type {
  CharacterSummary,
  DeleteResult,
  EpisodeResults,
  ExplorerChanges,
  MergeResult,
  OrphanEpisode,
  RecentEpisode,
  ShotRow
} from '@shared/types'

interface ResultsState {
  recent: RecentEpisode[]
  loadingRecent: boolean
  /** Episódios no histórico cuja pasta não está mais no disco. */
  missingRoots: number
  /** Pastas completas no disco que o histórico não conhece. */
  orphans: OrphanEpisode[]
  restoring: string

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

  /** Faxina do Explorer detectada ao abrir o episódio. */
  explorer: ExplorerChanges | null
  /**
   * Última pasta de lixeira criada nesta sessão. Existe só pra a tela
   * poder oferecer "abrir" logo depois de excluir — que é o momento em
   * que a pessoa percebe que errou.
   */
  lastTrashDir: string
  /** Cenas marcadas pra mesclar, por id. */
  selection: number[]
  merging: boolean

  loadRecent: () => Promise<void>
  /** Reconstrói uma pasta esquecida e já a traz pro histórico. */
  restoreOrphan: (root: string) => Promise<void>
  /** Aplica a faxina do Explorer. `charIds` = pastas confirmadas. */
  applyExplorer: (charIds: number[]) => Promise<void>
  dismissExplorer: () => void
  openEpisode: (episodeId: number) => Promise<void>
  selectCharacter: (character: CharacterSummary) => Promise<void>
  setActiveShot: (shot: ShotRow | null) => void
  setCardWidth: (w: number) => void
  /** Marca/desmarca uma cena. Com `ate`, marca o intervalo inteiro. */
  toggleSelected: (shotId: number, ate?: boolean) => void
  clearSelection: () => void
  /**
   * Marca TODAS as cenas da lista atual, numa atualização só.
   *
   * Não dá pra fazer isso com um `forEach(toggleSelected)`: cada chamada é um
   * `set` do store, e cada `set` re-renderiza a grade inteira. Com 110 cenas
   * já dava pra sentir; com 573 a tela congelava.
   */
  selectAll: () => void
  mergeSelected: () => Promise<MergeResult | null>
  /**
   * Exclui as cenas marcadas — ou as de `ids`, quando vierem.
   *
   * O parâmetro existe pro Delete do teclado: apertar Delete com nada marcado
   * apaga a cena que está no player, e exigir marcar antes tornaria o atalho
   * inútil justamente no caso mais comum (vi, não presta, apaga).
   */
  deleteSelected: (ids?: number[]) => Promise<DeleteResult | null>
  close: () => void
}

/**
 * Item "Todas as cenas" da lista.
 *
 * id 0 é combinado com o backend: `shots` com character_id <= 0 devolve o
 * episódio inteiro. Um id real nunca é 0 (AUTOINCREMENT começa em 1).
 */
export const TODAS_AS_CENAS = 0

export const useResultsStore = create<ResultsState>((set, get) => ({
  recent: [],
  loadingRecent: false,
  missingRoots: 0,
  orphans: [],
  restoring: '',
  results: null,
  mediaPrefix: '',
  selectedCharacter: null,
  shots: [],
  loadingShots: false,
  activeShot: null,
  // 180px cabe em 3 colunas na largura padrão da janela. Acima disso a grade
  // cai pra 2 e a revisão fica lenta — o pedido original era "3 ou mais".
  cardWidth: 180,
  explorer: null,
  lastTrashDir: '',
  selection: [],
  merging: false,

  loadRecent: async () => {
    set({ loadingRecent: true })
    try {
      const r = await window.ancut.results.recent()
      set({ recent: r.episodes, missingRoots: r.missingFolders })
      // Depois do histórico, e sem travar a tela: a varredura lê o disco e
      // só interessa quando a lista já está lá pra comparar.
      set({ orphans: await window.ancut.results.orphans() })
    } finally {
      set({ loadingRecent: false })
    }
  },

  restoreOrphan: async (root) => {
    set({ restoring: root })
    try {
      const r = await window.ancut.results.restore(root)
      if (!r) return
      // Recarrega em vez de remendar a lista na mão: o episódio restaurado
      // precisa entrar no lugar certo da ordenação por data.
      await get().loadRecent()
    } finally {
      set({ restoring: '' })
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
      activeShot: null,
      explorer: null,
      lastTrashDir: ''
    })
    // Sem personagem nenhum a tela abriria VAZIA, mesmo com as cenas todas
    // ali. Acontece de verdade: numa abertura curta, ninguém alcança o mínimo
    // de cenas por personagem e o episódio inteiro fica só em "Todas as
    // cenas". Cair nela é melhor do que não cair em nada.
    const first = results.characters[0] ?? {
      id: TODAS_AS_CENAS,
      name: 'Todas as cenas',
      shotCount: results.totalShots
    }
    await get().selectCharacter(first)

    // A varredura do disco vem por último, sem bloquear a abertura: ela lê
    // centenas de arquivos e o episódio já está utilizável sem ela.
    const explorer = await window.ancut.results.explorerScan(episodeId)
    // Só avisa se ainda for o mesmo episódio e se houver algo pra dizer.
    if (get().results?.episodeId !== episodeId) return
    if (
      explorer &&
      explorer.safe &&
      (explorer.missingClips > 0 ||
        explorer.unlinkedPairs.length > 0 ||
        explorer.missingFolders.length > 0)
    ) {
      set({ explorer })
    }
  },

  selectCharacter: async (character) => {
    const results = get().results
    if (!results) return
    // Trocar de lista limpa a seleção: marcar cenas de um personagem e mesclar
    // vendo outro seria mesclar às cegas.
    set({
      selectedCharacter: character,
      loadingShots: true,
      activeShot: null,
      selection: []
    })
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

  toggleSelected: (shotId, ate = false) => {
    const { selection, shots } = get()
    if (ate && selection.length > 0) {
      // Shift: fecha o intervalo entre a última marcada e esta. É o gesto que
      // importa aqui — mesclar quase sempre é juntar uma sequência contígua.
      const ordem = shots.map((s) => s.id)
      const de = ordem.indexOf(selection[selection.length - 1])
      const ateIdx = ordem.indexOf(shotId)
      if (de >= 0 && ateIdx >= 0) {
        const [ini, fim] = de < ateIdx ? [de, ateIdx] : [ateIdx, de]
        const faixa = ordem.slice(ini, fim + 1)
        return set({ selection: [...new Set([...selection, ...faixa])] })
      }
    }
    set({
      selection: selection.includes(shotId)
        ? selection.filter((i) => i !== shotId)
        : [...selection, shotId]
    })
  },

  clearSelection: () => set({ selection: [] }),

  selectAll: () => set({ selection: get().shots.map((s) => s.id) }),

  mergeSelected: async () => {
    const { results, selection, selectedCharacter } = get()
    if (!results || selection.length < 2) return null
    set({ merging: true })
    try {
      const r = await window.ancut.results.merge(results.episodeId, selection)
      if (!r) return null
      await recarregar(set, results.episodeId, selectedCharacter)
      return r
    } finally {
      set({ merging: false })
    }
  },

  deleteSelected: async (ids) => {
    const { results, selection, selectedCharacter } = get()
    const alvos = ids && ids.length > 0 ? ids : selection
    if (!results || alvos.length === 0) return null
    set({ merging: true })
    try {
      const r = await window.ancut.results.remove(results.episodeId, alvos)
      if (!r) return null
      set({ lastTrashDir: r.trashDir ?? '' })
      await recarregar(set, results.episodeId, selectedCharacter)
      return r
    } finally {
      set({ merging: false })
    }
  },

  applyExplorer: async (charIds) => {
    const { results, selectedCharacter } = get()
    if (!results) return
    await window.ancut.results.explorerApply(results.episodeId, charIds)
    set({ explorer: null })
    await recarregar(set, results.episodeId, selectedCharacter)
  },

  dismissExplorer: () => set({ explorer: null }),

  close: () =>
    set({
      results: null,
      explorer: null,
      lastTrashDir: '',
      mediaPrefix: '',
      selectedCharacter: null,
      shots: [],
      activeShot: null,
      selection: []
    })
}))

/**
 * Relê episódio e cenas do backend depois de mexer no acervo.
 *
 * Mesclar e excluir alteram o banco (linhas somem, às vezes entra uma), e
 * remendar a lista em memória divergiria do disco na primeira divergência.
 * Um só lugar faz isso pras duas operações não se comportarem diferente.
 */
async function recarregar(
  set: (patch: Partial<ResultsState>) => void,
  episodeId: number,
  personagem: CharacterSummary | null
): Promise<void> {
  set({ selection: [], activeShot: null })
  const atual = await window.ancut.results.load(episodeId)
  if (atual) set({ results: atual })
  if (personagem) {
    set({ shots: await window.ancut.results.shots(episodeId, personagem.id) })
  }
}

/**
 * Caminho REAL no disco de um arquivo do episódio.
 *
 * O `media://` serve pra exibir e tocar dentro do app; pra arrastar pra fora
 * ou abrir no Explorer, quem recebe é o Windows, e ele só entende o caminho
 * de verdade. O separador sai do próprio `episodeRoot` em vez de ser fixo:
 * é ele que diz como a máquina que analisou escreve caminho.
 */
export function diskPath(episodeRoot: string, relative: string | null): string | null {
  if (!episodeRoot || !relative) return null
  const sep = episodeRoot.includes('\\') ? '\\' : '/'
  return episodeRoot.replace(/[\\/]+$/, '') + sep + relative
}

/** Monta a URL media:// de um caminho relativo dentro do episódio. */
export function mediaUrl(prefix: string, relative: string | null): string | null {
  if (!prefix || !relative) return null
  return prefix + encodeURIComponent(relative)
}
