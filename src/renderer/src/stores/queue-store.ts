import { create } from 'zustand'
import type { AnalysisEvent, EpisodeKind } from '@shared/types'
import { useAnalysisStore } from './analysis-store'
import { useEpisodeStore } from './episode-store'

/**
 * Fila de cortes.
 *
 * Só CORTAR, nunca identificar — e isso não é limitação de tempo, é o que
 * permite a fila existir. Identificar para no meio pra perguntar coisas
 * (anime não encontrado, refs faltando, batismo do Modo Descoberta), e uma
 * fila que trava esperando resposta na terceira de oito é pior que fila
 * nenhuma. Cortar não pergunta nada: não usa internet, não reconhece
 * ninguém, roda sozinho até o fim.
 *
 * Identificar depois é um clique por episódio, na aba Resultados, e aí a
 * pessoa está sentada na frente pra responder o que for preciso.
 */

export type StatusItem = 'esperando' | 'cortando' | 'pronto' | 'falhou'

export interface ItemFila {
  /** Só pra chave de lista e remoção — o caminho pode repetir. */
  id: string
  videoPath: string
  nomeArquivo: string
  anime: string
  season: number
  episode: number
  kind: EpisodeKind
  status: StatusItem
  erro?: string
  /** Preenchidos quando termina, pra tela poder abrir o resultado. */
  episodeId?: number
  shots?: number
}

interface QueueState {
  itens: ItemFila[]
  /** A fila está processando (não é o mesmo que "tem item cortando"). */
  rodando: boolean
  /** Lendo nome de arquivo pra preencher anime/temporada/episódio. */
  lendo: boolean

  adicionar: (paths: string[]) => Promise<void>
  remover: (id: string) => void
  limparProntos: () => void
  limparTudo: () => void
  editar: (id: string, patch: Partial<ItemFila>) => void

  iniciar: () => Promise<void>
  /** Para a fila. O episódio em andamento é cancelado junto. */
  parar: () => void
  /** Eventos do motor — a fila só se interessa pelos terminais. */
  aplicar: (event: AnalysisEvent) => void
}

let contador = 0

/** Nome do arquivo sem a pasta. */
function nomeDe(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export const useQueueStore = create<QueueState>((set, get) => ({
  itens: [],
  rodando: false,
  lendo: false,

  adicionar: async (paths) => {
    if (paths.length === 0) return
    set({ lendo: true })
    try {
      // O motor já sabe ler "S04E23" de um nome de arquivo — é a mesma
      // dedução do formulário de um episódio só. Em série, uma chamada por
      // arquivo: cada uma abre um processo, mas são ~1s e acontecem uma
      // vez só, na hora de montar a fila.
      const novos: ItemFila[] = []
      for (const videoPath of paths) {
        if (get().itens.some((i) => i.videoPath === videoPath)) continue
        const p = await window.ancut.episode.parseFilename(videoPath)
        novos.push({
          id: `f${++contador}`,
          videoPath,
          nomeArquivo: nomeDe(videoPath),
          anime: p?.anime ?? '',
          season: p?.season ?? 1,
          episode: p?.episode ?? 1,
          kind: (p?.kind ?? '') as EpisodeKind,
          status: 'esperando'
        })
      }
      set({ itens: [...get().itens, ...novos] })
    } finally {
      set({ lendo: false })
    }
  },

  remover: (id) => set({ itens: get().itens.filter((i) => i.id !== id) }),

  limparProntos: () =>
    set({ itens: get().itens.filter((i) => i.status !== 'pronto') }),

  limparTudo: () => set({ itens: [] }),

  editar: (id, patch) =>
    set({ itens: get().itens.map((i) => (i.id === id ? { ...i, ...patch } : i)) }),

  iniciar: async () => {
    if (get().rodando) return
    set({ rodando: true })
    await dispararProximo(set, get)
  },

  parar: () => {
    set({ rodando: false })
    // Volta o que estava cortando pra "esperando": cancelar não é falhar, e
    // os clipes já feitos ficam em cache — recomeçar sai do ponto em que
    // parou, não do zero.
    set({
      itens: get().itens.map((i) =>
        i.status === 'cortando' ? { ...i, status: 'esperando' as StatusItem } : i
      )
    })
    void window.ancut.analysis.cancel()
  },

  aplicar: (event) => {
    if (!get().rodando) return
    const atual = get().itens.find((i) => i.status === 'cortando')
    if (!atual) return

    if (event.type === 'done') {
      get().editar(atual.id, {
        status: 'pronto',
        episodeId: event.result.episodeId,
        shots: event.result.totalShots
      })
      void dispararProximo(set, get)
      return
    }

    if (event.type === 'failed') {
      // Um episódio ruim não derruba a fila: marca e segue. Parar tudo por
      // causa do terceiro de oito desperdiçaria a noite inteira de quem
      // deixou rodando.
      get().editar(atual.id, { status: 'falhou', erro: event.message })
      void dispararProximo(set, get)
      return
    }

    if (event.type === 'cancelled') {
      get().editar(atual.id, { status: 'esperando' })
      set({ rodando: false })
    }
  }
}))

/**
 * Manda o próximo da fila pro motor.
 *
 * As opções que não vêm do arquivo (pasta de saída, tipo de mídia, formato
 * de export) saem do formulário de um episódio só — é o mesmo lugar onde a
 * pessoa já configurou tudo isso, e ter uma segunda cópia dessas escolhas
 * só pra fila daria pra elas discordarem.
 */
async function dispararProximo(
  set: (patch: Partial<QueueState>) => void,
  get: () => QueueState
): Promise<void> {
  if (!get().rodando) return
  const proximo = get().itens.find((i) => i.status === 'esperando')
  if (!proximo) {
    set({ rodando: false })
    return
  }

  const ep = useEpisodeStore.getState()
  if (!ep.outputDir.trim()) {
    get().editar(proximo.id, {
      status: 'falhou',
      erro: 'Escolha a pasta de saída no formulário acima.'
    })
    set({ rodando: false })
    return
  }

  get().editar(proximo.id, { status: 'cortando', erro: undefined })
  // Zera o painel de progresso e o põe em "rodando", igual ao fluxo de um
  // episódio só. Sem isto o painel mostraria as etapas do episódio ANTERIOR
  // enquanto o novo começa, e a barra pareceria voltar no tempo.
  useAnalysisStore.getState().begin()
  try {
    await window.ancut.analysis.start({
      videoPath: proximo.videoPath,
      anime: proximo.anime.trim(),
      season: proximo.season,
      episode: proximo.episode,
      kind: proximo.kind,
      outputDir: ep.outputDir.trim(),
      // Vazio = o motor decide pela memória de pastas. Na fila os animes
      // podem ser diferentes entre si, então mandar a pasta resolvida do
      // formulário jogaria todos na pasta do último nome digitado.
      outputFolder: '',
      skipHeadSeconds: 0,
      skipTailSeconds: 0,
      params: ep.params,
      aiReview: false,
      discovery: false,
      cutOnly: true,
      mergePrevious: false,
      skipCreditShots: ep.skipCreditShots,
      useDanbooru: ep.useDanbooru,
      mediaKind: ep.mediaKind,
      renderExportMode: ep.renderExportMode
    })
  } catch (e) {
    // O start falha antes de o motor subir (já tem análise rodando, motor
    // não encontrado): nenhum evento vai chegar, então o erro tem que ser
    // tratado aqui ou a fila ficaria parada pra sempre.
    get().editar(proximo.id, {
      status: 'falhou',
      erro: e instanceof Error ? e.message : 'Falha ao iniciar o corte.'
    })
    void dispararProximo(set, get)
  }
}
