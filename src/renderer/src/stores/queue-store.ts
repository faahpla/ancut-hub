import { create } from 'zustand'
import type {
  AnalysisEvent,
  DiscoveryReadyEvent,
  EpisodeKind,
  EventoLink,
  QualidadeDownload,
  RecentEpisode,
  VideoDoLink
} from '@shared/types'
import { pastaDoAnime } from '@/features/library/group-episodes'
import { pedidoDeIdentificacao } from '@/lib/identificar'
import { episodeLabel, tituloSemAnime } from '@/lib/utils'
import { aoDescobrir, useAnalysisStore } from './analysis-store'
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
 * **Análise rápida** (11/2026, pedido do Levi) — reconhece sozinho quem o
 * app já conhece: o elenco do AniList e quem foi batizado no Modo
 * Descoberta (os rostos batizados viram referência). Não para pra nada:
 * a pergunta que a análise faria (anime não encontrado, refs faltando)
 * vira "falhou" com o motivo, e a fila segue pro próximo.
 *
 * E a Descoberta na fila só PARA quando aparece gente nova: se todo
 * personagem que importa no episódio já foi batizado antes, ela confirma
 * sozinha (ver `confirmarSeTodosConhecidos`). Era o "identificar todo
 * episódio" que cansava.
 */

/** `pulado`: episódio que já tinha personagens — ver `dispararProximo`. */
export type StatusItem = 'esperando' | 'baixando' | 'cortando' | 'pronto' | 'falhou' | 'pulado'
export type ModoItem = 'cortar' | 'reconhecer' | 'descobrir'

const CHAVE_MODO = 'ancut.fila.modo'
const CHAVE_SOZINHA = 'ancut.fila.descoberta-sozinha'

function lerModo(): ModoItem {
  try {
    const v = localStorage.getItem(CHAVE_MODO)
    return v === 'reconhecer' || v === 'descobrir' ? v : 'cortar'
  } catch {
    return 'cortar'
  }
}

function lerSozinha(): boolean {
  try {
    return localStorage.getItem(CHAVE_SOZINHA) !== 'nao'
  } catch {
    return true
  }
}

export interface ItemFila {
  /** Só pra chave de lista e remoção — o caminho pode repetir. */
  id: string
  modo: ModoItem
  /** Vazio quando vem da Biblioteca (`origemId`): o vídeo sai do histórico. */
  videoPath: string
  nomeArquivo: string
  anime: string
  season: number
  episode: number
  kind: EpisodeKind
  /** Da Biblioteca: o episódio JÁ cortado que vai ser identificado. */
  origemId?: number
  status: StatusItem
  erro?: string
  /** Preenchidos quando termina, pra tela poder abrir o resultado. */
  episodeId?: number
  shots?: number
  /**
   * Veio de um link: primeiro baixa (pra `link.pasta`), depois corta como
   * B-roll. `videoPath` fica vazio até o download terminar.
   */
  link?: { url: string; pasta: string; qualidade: QualidadeDownload; inicio?: number; fim?: number }
  /** Pasta do anime na saída — a mesma onde o vídeo baixado fica guardado. */
  pastaAnime?: string
  /** B-roll: nome do vídeo e de onde ele veio. */
  titulo?: string
  origem?: string
  /** Durante o download: 0..1, ou -1 quando o site não diz quanto falta. */
  progresso?: number
  /** O que está acontecendo agora ("baixando 45% · 2,1 MB/s"). */
  etapa?: string
  /** Recado sobre como terminou ("todos já conhecidos — confirmado sozinho"). */
  nota?: string
}

interface QueueState {
  itens: ItemFila[]
  /** A fila está processando (não é o mesmo que "tem item rodando"). */
  rodando: boolean
  /** Lendo nome de arquivo pra preencher anime/temporada/episódio. */
  lendo: boolean
  /** O que fazer com os episódios que entram (e os que estão esperando). */
  modoNovos: ModoItem
  setModoNovos: (m: ModoItem) => void
  /** Descoberta: confirmar sozinha quando não aparece ninguém novo. */
  descobertaSozinha: boolean
  setDescobertaSozinha: (v: boolean) => void

  adicionar: (paths: string[]) => Promise<void>
  /**
   * Um vídeo já conferido no cartão do arquivo: entra com o nome, temporada
   * e episódio que estão na tela, e não com o que o nome do arquivo diz —
   * senão a correção feita à mão se perderia no caminho pra fila.
   */
  adicionarConferido: (v: {
    videoPath: string
    anime: string
    season: number
    episode: number
    kind: EpisodeKind
    titulo?: string
    origem?: string
    modo?: ModoItem
  }) => void
  /** Vídeos de um link: baixar e cortar como B-roll, um depois do outro. */
  adicionarLinks: (
    videos: VideoDoLink[],
    opcoes: { anime: string; pastaAnime: string; pasta: string; qualidade: QualidadeDownload; inicio?: number; fim?: number }
  ) => void
  /** Episódios já cortados, pra identificar um depois do outro. */
  adicionarDescoberta: (eps: RecentEpisode[], modo?: 'descobrir' | 'reconhecer') => void
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
/** Recado pro item que está terminando — quem põe é a confirmação sozinha. */
let notaDoAutomatico: string | undefined

/** Nome do arquivo sem a pasta. */
function nomeDe(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** "Slime S04E24" — a pasta do anime, que é o que a Biblioteca mostra. */
function rotuloDe(item: ItemFila): string {
  const ep = episodeLabel(item.season, item.episode, item.kind, item.titulo)
  return item.anime ? `${item.anime} ${ep}` : item.nomeArquivo
}

export const useQueueStore = create<QueueState>((set, get) => ({
  itens: [],
  rodando: false,
  lendo: false,
  modoNovos: lerModo(),
  descobertaSozinha: lerSozinha(),

  setModoNovos: (m) => {
    try {
      localStorage.setItem(CHAVE_MODO, m)
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
    // Vale também pros arquivos que já estão esperando — é o gesto de quem
    // soltou oito episódios e só depois lembrou de escolher. B-roll de link
    // fica no corte (trailer de jogo não tem elenco), e o que veio da
    // Biblioteca já tem o modo que foi pedido lá.
    set({
      modoNovos: m,
      itens: get().itens.map((i) =>
        i.status === 'esperando' && i.origemId === undefined && !i.link ? { ...i, modo: m } : i
      )
    })
  },

  setDescobertaSozinha: (v) => {
    try {
      localStorage.setItem(CHAVE_SOZINHA, v ? 'sim' : 'nao')
    } catch {
      /* idem */
    }
    set({ descobertaSozinha: v })
  },

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
        if (get().itens.some((i) => i.origemId === undefined && i.videoPath === videoPath)) {
          continue
        }
        const p = await window.ancut.episode.parseFilename(videoPath)
        novos.push({
          id: `f${++contador}`,
          modo: get().modoNovos,
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

  adicionarConferido: (v) => {
    if (get().itens.some((i) => i.origemId === undefined && i.videoPath === v.videoPath)) return
    const item: ItemFila = {
      id: `f${++contador}`,
      modo: v.modo ?? 'cortar',
      nomeArquivo: nomeDe(v.videoPath),
      status: 'esperando',
      ...v
    }
    set({ itens: [...get().itens, item] })
  },

  adicionarLinks: (videos, o) => {
    const ja = new Set(get().itens.map((i) => i.origem).filter(Boolean))
    const novos: ItemFila[] = videos
      .filter((v) => !ja.has(v.url))
      .map((v) => ({
        id: `f${++contador}`,
        modo: 'cortar',
        videoPath: '',
        nomeArquivo: v.titulo,
        anime: o.anime,
        season: 1,
        // 0 = o motor escolhe o próximo número livre de B-roll na pasta.
        episode: 0,
        kind: 'BROLL' as EpisodeKind,
        titulo: tituloSemAnime(v.titulo, o.anime),
        // Trecho é outro B-roll: com o link puro ele cairia na vaga do vídeo
        // inteiro (mesma origem) e o substituiria.
        origem: o.inicio || o.fim ? `${v.url}#trecho=${o.inicio ?? 0}-${o.fim ?? 0}` : v.url,
        pastaAnime: o.pastaAnime,
        link: { url: v.url, pasta: o.pasta, qualidade: o.qualidade, inicio: o.inicio, fim: o.fim },
        status: 'esperando' as StatusItem
      }))
    set({ itens: [...get().itens, ...novos] })
  },

  adicionarDescoberta: (eps, modo = 'descobrir') => {
    const jaNaFila = new Set(
      get()
        .itens.filter((i) => i.origemId !== undefined && i.status === 'esperando')
        .map((i) => i.origemId)
    )
    const novos: ItemFila[] = eps
      .filter((e) => !jaNaFila.has(e.episodeId))
      .map((e) => ({
        id: `f${++contador}`,
        modo,
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
    ouvirDownloads()
    set({ rodando: true })
    await dispararProximo(set, get)
  },

  parar: () => {
    set({ rodando: false })
    // Volta o que estava rodando pra "esperando": cancelar não é falhar, e
    // os clipes já feitos ficam em cache — recomeçar sai do ponto em que
    // parou, não do zero.
    const baixando = get().itens.some((i) => i.status === 'baixando')
    set({
      itens: get().itens.map((i) =>
        i.status === 'cortando' || i.status === 'baixando'
          ? { ...i, status: 'esperando' as StatusItem, progresso: undefined, etapa: undefined }
          : i
      )
    })
    if (baixando) void window.ancut.link.cancelar()
    else void window.ancut.analysis.cancel()
  },

  aplicar: (event) => {
    if (!get().rodando) return
    const atual = get().itens.find((i) => i.status === 'cortando')
    if (!atual) return

    if (event.type === 'done') {
      get().editar(atual.id, {
        status: 'pronto',
        nota: notaDoAutomatico ?? atual.nota,
        episodeId: event.result.episodeId,
        shots: event.result.totalShots
      })
      notaDoAutomatico = undefined
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
      notaDoAutomatico = undefined
      // Na Análise rápida, a pergunta que ficou sem resposta tem saída
      // conhecida: batizar esse episódio no Modo Descoberta. Dizer isso
      // poupa a pessoa de adivinhar.
      const dica =
        event.type === 'needs-input' && atual.modo === 'reconhecer'
          ? event.kind === 'refs-missing'
            ? ' — o app ainda não conhece ninguém deste anime: rode este episódio no Modo Descoberta e batize.'
            : ' — rode este episódio no Modo Descoberta: os nomes que você der ficam valendo pros próximos.'
          : ''
      get().editar(atual.id, { status: 'falhou', erro: `${event.message}${dica}` })
      void dispararProximo(set, get)
      return
    }

    if (event.type === 'cancelled') {
      notaDoAutomatico = undefined
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
  let proximo = get().itens.find((i) => i.status === 'esperando')
  if (!proximo) {
    set({ rodando: false })
    return
  }

  const idDoItem = proximo.id
  const falhar = (erro: string): Promise<void> => {
    get().editar(idDoItem, { status: 'falhou', erro })
    return dispararProximo(set, get)
  }

  const ep = useEpisodeStore.getState()

  if (proximo.origemId !== undefined) {
    const descobrir = proximo.modo === 'descobrir'
    // O pedido sai do que o banco sabe do episódio já cortado — o mesmo que
    // o botão "Identificar personagens" usa. É isso que mantém o episódio na
    // pasta em que ele mora, reaproveitando o corte.
    const results =
      proximo.origemId !== undefined ? await window.ancut.results.load(proximo.origemId) : null
    if (!get().rodando) return
    if (!results) return falhar('O episódio não está mais no histórico.')
    // Já identificado: pula (só na Descoberta). Refazer a descoberta APAGA
    // as cenas e as recria
    // (`clear_episode_shots`), e com elas vão os favoritos e as marcações à
    // mão daquele episódio. Um "Marcar todos" na Biblioteca pega episódio
    // que já está pronto, e a fila não pode cobrar isso calada.
    if (descobrir && results.characters.length > 0) {
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
      // Análise rápida em cima do que já existe SOMA: a curadoria à mão e
      // os favoritos daquele episódio continuam.
      const pedido = pedidoDeIdentificacao(results, ep, descobrir)
      await window.ancut.analysis.start(descobrir ? pedido : { ...pedido, mergePrevious: true })
    } catch (e) {
      return falhar(e instanceof Error ? e.message : 'Falha ao iniciar a identificação.')
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

  // Veio de link: baixa primeiro. O vídeo fica guardado (pasta Baixados do
  // anime), então cortar de novo depois não baixa outra vez.
  if (proximo.link && !proximo.videoPath) {
    const id = proximo.id
    get().editar(id, { status: 'baixando', progresso: 0, etapa: 'Começando o download…', erro: undefined })
    const r = await window.ancut.link.baixar(proximo.link)
    if (!get().rodando) return
    if ('erro' in r) {
      get().editar(id, { progresso: undefined, etapa: undefined })
      return falhar(r.erro)
    }
    get().editar(id, {
      videoPath: r.arquivo,
      // A do item ganha: num trecho ela leva a marca do trecho, e a do
      // download (o link puro) faria o trecho ocupar a vaga do vídeo inteiro.
      origem: proximo.origem || r.origem,
      titulo: proximo.titulo || tituloSemAnime(r.titulo, proximo.anime),
      progresso: undefined,
      etapa: undefined
    })
    proximo = get().itens.find((i) => i.id === id)
    if (!proximo) return dispararProximo(set, get)
  }

  // Descoberta num arquivo que já tem personagens: pula, pela mesma razão
  // do ramo da Biblioteca — refazê-la apagaria favoritos e marcações.
  if (proximo.modo === 'descobrir' && proximo.kind !== 'BROLL') {
    const ja = await window.ancut.episode.hasAnalysis(
      proximo.videoPath,
      proximo.anime.trim(),
      proximo.season,
      proximo.episode,
      proximo.kind
    )
    if (!get().rodando) return
    if (ja) {
      get().editar(proximo.id, {
        status: 'pulado',
        erro: 'Já tinha personagens — pulado pra não apagar favoritos e marcações. A Análise rápida completa sem apagar.'
      })
      return dispararProximo(set, get)
    }
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
      // formulário jogaria todos na pasta do último nome digitado. O link
      // já sabe a dele: é onde o vídeo baixado ficou guardado.
      outputFolder: proximo.pastaAnime ?? '',
      skipHeadSeconds: 0,
      skipTailSeconds: 0,
      params: ep.params,
      aiReview: false,
      // B-roll é sempre só corte: trailer de jogo não tem elenco, e uma
      // pergunta de "anime não encontrado" depois do download jogaria o
      // vídeo baixado fora.
      discovery: proximo.modo === 'descobrir' && proximo.kind !== 'BROLL',
      cutOnly: proximo.modo === 'cortar' || proximo.kind === 'BROLL',
      // Rápida por cima de análise antiga soma, não substitui.
      mergePrevious: proximo.modo === 'reconhecer',
      skipCreditShots: ep.skipCreditShots,
      useDanbooru: ep.useDanbooru,
      mediaKind: ep.mediaKind,
      renderExportMode: ep.renderExportMode,
      titulo: proximo.titulo,
      origem: proximo.origem
    })
  } catch (e) {
    // O start falha antes de o motor subir (motor não encontrado): nenhum
    // evento vai chegar, então o erro tem que ser tratado aqui ou a fila
    // ficaria parada pra sempre.
    return falhar(e instanceof Error ? e.message : 'Falha ao iniciar o corte.')
  }
}

let ouvindo = false

/**
 * Progresso do download no item que está baixando. Um ouvinte só, ligado na
 * primeira vez que a fila anda — o baixador é um só no main.
 */
function ouvirDownloads(): void {
  if (ouvindo) return
  ouvindo = true
  window.ancut.link.onEvento((ev: EventoLink) => {
    const st = useQueueStore.getState()
    const atual = st.itens.find((i) => i.status === 'baixando')
    if (!atual) return
    if (ev.tipo === 'ferramenta') {
      const pct = ev.fracao >= 0 ? ` ${Math.round(ev.fracao * 100)}%` : ''
      st.editar(atual.id, { progresso: ev.fracao, etapa: `${ev.mensagem}${pct}` })
      return
    }
    const partes =
      ev.fase === 'juntando'
        ? ['Juntando áudio e vídeo…']
        : [
            ev.fracao >= 0 ? `Baixando ${Math.round(ev.fracao * 100)}%` : 'Baixando o trecho…',
            ev.velocidade && ev.velocidade !== 'NA' ? ev.velocidade : '',
            ev.falta && ev.falta !== 'NA' ? `falta ${ev.falta}` : ''
          ]
    st.editar(atual.id, { progresso: ev.fracao, etapa: partes.filter(Boolean).join(' · ') })
  })
}

/**
 * Descoberta na fila sem ninguém novo: confirma sozinha.
 *
 * Todo grupo que importa (os figurantes ficam de fora, como na tela) já foi
 * reconhecido como alguém batizado em outro episódio — a tela de batismo
 * só pediria um "Salvar" sem mudar nada. Aparecendo QUALQUER rosto
 * relevante desconhecido, ela para como sempre, com os conhecidos já
 * preenchidos. Devolve true quando confirmou (a tela não abre).
 */
function confirmarSeTodosConhecidos(ev: DiscoveryReadyEvent): boolean {
  const fila = useQueueStore.getState()
  if (!fila.rodando || !fila.descobertaSozinha) return false
  const atual = fila.itens.find((i) => i.status === 'cortando')
  if (!atual || atual.modo !== 'descobrir') return false
  const relevantes = ev.groups.filter((g) => !g.minor)
  if (relevantes.length === 0 || relevantes.some((g) => g.known !== true)) return false
  const nomes: Record<number, string> = {}
  for (const g of ev.groups) if (g.known === true && g.suggestedName) nomes[g.key] = g.suggestedName
  if (Object.keys(nomes).length === 0) return false
  const quem = [...new Set(Object.values(nomes))]
  notaDoAutomatico = `Ninguém novo — confirmado sozinho (${quem.slice(0, 4).join(', ')}${quem.length > 4 ? '…' : ''}).`
  void window.ancut.analysis.commitDiscovery(nomes, {})
  return true
}

aoDescobrir(confirmarSeTodosConhecidos)
