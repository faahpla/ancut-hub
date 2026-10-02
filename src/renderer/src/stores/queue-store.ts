import { create } from 'zustand'
import type { AnalysisEvent, EpisodeKind, RecentEpisode } from '@shared/types'
import { pastaDoAnime } from '@/features/library/group-episodes'
import { pedidoDeIdentificacao } from '@/lib/identificar'
import { episodeLabel } from '@/lib/utils'
import { useAnalysisStore } from './analysis-store'
import { useEpisodeStore } from './episode-store'
import { useReforcoStore } from './reforco-store'

/**
 * A fila: vários episódios em sequência, num motor só.
 *
 * Faz duas coisas, com naturezas diferentes:
 *
 * **Cortar** — sem ninguém olhando. Não usa internet, não reconhece
 * ninguém, não pergunta nada: roda sozinho até o fim. É o "estou na
 * correria, deixa cortando".
 *
 * **Modo Descoberta** — com a pessoa na frente. Cada episódio para na tela
 * de batismo esperando os nomes, e só segue quando eles chegam. Não é fila
 * de largar rodando; é fila pra não ter que voltar à Biblioteca entre um
 * episódio e outro. Foi o pedido: cortar vários pela fila, depois sentar e
 * identificar todos em sequência.
 *
 * O "Automático" fica de fora de propósito: ele para pra perguntar coisas
 * que não são nomes (anime não encontrado, refs faltando), e uma fila
 * travada numa pergunta dessas na terceira de oito é pior que fila nenhuma.
 */

/** `pulado`: episódio que já tinha personagens — ver `dispararProximo`. */
export type StatusItem = 'esperando' | 'cortando' | 'pronto' | 'falhou' | 'pulado'
export type ModoItem = 'cortar' | 'descobrir'

export interface ItemFila {
  /** Só pra chave de lista e remoção — o caminho pode repetir. */
  id: string
  modo: ModoItem
  /** Vazio em 'descobrir': o vídeo vem do histórico na hora de rodar. */
  videoPath: string
  nomeArquivo: string
  anime: string
  season: number
  episode: number
  kind: EpisodeKind
  /** 'descobrir': o episódio JÁ cortado que vai ser identificado. */
  origemId?: number
  status: StatusItem
  erro?: string
  /** Preenchidos quando termina, pra tela poder abrir o resultado. */
  episodeId?: number
  shots?: number
}

interface QueueState {
  itens: ItemFila[]
  /** A fila está processando (não é o mesmo que "tem item rodando"). */
  rodando: boolean
  /** Lendo nome de arquivo pra preencher anime/temporada/episódio. */
  lendo: boolean

  adicionar: (paths: string[]) => Promise<void>
  /** Episódios já cortados, pra identificar um depois do outro. */
  adicionarDescoberta: (eps: RecentEpisode[]) => void
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

/** "Slime S04E24" — a pasta do anime, que é o que a Biblioteca mostra. */
function rotuloDe(item: ItemFila): string {
  const ep = episodeLabel(item.season, item.episode, item.kind)
  return item.anime ? `${item.anime} ${ep}` : item.nomeArquivo
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
        if (get().itens.some((i) => i.modo === 'cortar' && i.videoPath === videoPath)) {
          continue
        }
        const p = await window.ancut.episode.parseFilename(videoPath)
        novos.push({
          id: `f${++contador}`,
          modo: 'cortar',
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

  adicionarDescoberta: (eps) => {
    const jaNaFila = new Set(
      get()
        .itens.filter((i) => i.modo === 'descobrir' && i.status === 'esperando')
        .map((i) => i.origemId)
    )
    const novos: ItemFila[] = eps
      .filter((e) => !jaNaFila.has(e.episodeId))
      .map((e) => ({
        id: `f${++contador}`,
        modo: 'descobrir',
        videoPath: '',
        nomeArquivo: '',
        // A pasta do anime, não o título da fonte: é o que a Biblioteca mostra
        // e o que a pessoa acabou de marcar.
        anime: nomeDe(pastaDoAnime(e.episodeRoot)) || e.animeTitle,
        season: e.season,
        episode: e.episode,
        kind: e.kind,
        origemId: e.episodeId,
        status: 'esperando'
      }))
    set({ itens: [...get().itens, ...novos] })
  },

  remover: (id) => set({ itens: get().itens.filter((i) => i.id !== id) }),

  limparProntos: () =>
    set({ itens: get().itens.filter((i) => i.status !== 'pronto' && i.status !== 'pulado') }),

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
    // Volta o que estava rodando pra "esperando": cancelar não é falhar, e
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
      // O reforço pedido no batismo roda ANTES do próximo episódio, e a fila
      // espera ele: reforço e análise abrem cada um o seu motor, e os dois
      // carregando modelo na mesma placa só deixaria os dois lentos.
      const reforcar = useAnalysisStore.getState().consumirReforco()
      void (async () => {
        if (reforcar) {
          await useReforcoStore.getState().rodar(event.result.episodeId, rotuloDe(atual))
        }
        await dispararProximo(set, get)
      })()
      return
    }

    if (event.type === 'failed' || event.type === 'needs-input') {
      // Um episódio ruim não derruba a fila: marca e segue. Parar tudo por
      // causa do terceiro de oito desperdiçaria a noite inteira de quem
      // deixou rodando. `needs-input` entra aqui porque, na fila, não há
      // quem responda à pergunta — e esperar por ela travaria a fila pra
      // sempre.
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

  const falhar = (erro: string): Promise<void> => {
    get().editar(proximo.id, { status: 'falhou', erro })
    return dispararProximo(set, get)
  }

  const ep = useEpisodeStore.getState()

  if (proximo.modo === 'descobrir') {
    // O pedido sai do que o banco sabe do episódio já cortado — o mesmo que
    // o botão "Identificar personagens" usa. É isso que mantém o episódio na
    // pasta em que ele mora, reaproveitando o corte.
    const results =
      proximo.origemId !== undefined ? await window.ancut.results.load(proximo.origemId) : null
    if (!get().rodando) return
    if (!results) return falhar('O episódio não está mais no histórico.')
    // Já identificado: pula. Refazer a descoberta APAGA as cenas e as recria
    // (`clear_episode_shots`), e com elas vão os favoritos e as marcações à
    // mão daquele episódio. Um "Marcar todos" na Biblioteca pega episódio
    // que já está pronto, e a fila não pode cobrar isso calada.
    if (results.characters.length > 0) {
      get().editar(proximo.id, {
        status: 'pulado',
        episodeId: results.episodeId,
        erro: 'Já tinha personagens — pulado pra não apagar favoritos e marcações.'
      })
      return dispararProximo(set, get)
    }
    if (!results.sourceExists) {
      return falhar('O vídeo original não está mais no lugar — sem ele não há rosto pra agrupar.')
    }
    get().editar(proximo.id, { status: 'cortando', erro: undefined })
    useAnalysisStore.getState().begin()
    try {
      await window.ancut.analysis.start(pedidoDeIdentificacao(results, ep, true))
    } catch (e) {
      return falhar(e instanceof Error ? e.message : 'Falha ao iniciar a descoberta.')
    }
    return
  }

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
    // O start falha antes de o motor subir (motor não encontrado): nenhum
    // evento vai chegar, então o erro tem que ser tratado aqui ou a fila
    // ficaria parada pra sempre.
    return falhar(e instanceof Error ? e.message : 'Falha ao iniciar o corte.')
  }
}
