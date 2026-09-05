import type { EpisodeKind, RecentEpisode } from '@shared/types'

export interface Temporada {
  /** Número da temporada. */
  numero: number
  episodios: RecentEpisode[]
  cenas: number
}

export interface Anime {
  /** Caminho da pasta do anime no disco — a identidade do grupo. */
  pasta: string
  /** Nome da pasta, que é o rótulo mostrado. */
  nome: string
  /**
   * Títulos distintos que o motor gravou pros episódios deste grupo.
   *
   * Guardados pra tela poder dizer, quando forem vários, que aquela pasta
   * junta episódios que o banco ainda conhece por nomes diferentes.
   */
  titulos: string[]
  temporadas: Temporada[]
  episodios: number
  cenas: number
}

/**
 * Separa o caminho em pedaços, aceitando as duas barras.
 *
 * O banco guarda o caminho como a máquina que analisou escreveu, e nada
 * garante que seja a mesma que está abrindo agora.
 */
function pedacos(caminho: string): string[] {
  return caminho.split(/[\\/]+/).filter(Boolean)
}

/**
 * Pasta do anime a que um episódio pertence: a mãe da pasta do episódio.
 *
 * **Por que a pasta e não o título.** O título vem da fonte que resolveu o
 * anime, e a mesma franquia responde com nomes diferentes conforme a busca —
 * é assim que o histórico acabou com "Tensei Shitara Slime Datta Ken 2nd
 * Season Part 2" contendo S01, S02 e S04 ao mesmo tempo. Agrupar por título
 * copiaria essa bagunça pra tela nova.
 *
 * A pasta é escolhida pelo agrupamento por franquia desde a v1.9.0, e é
 * também o que o usuário vê no Explorer. Duas telas discordando sobre o que é
 * "um anime" seria pior do que qualquer imprecisão de uma delas só.
 */
export function pastaDoAnime(episodeRoot: string): string {
  const partes = pedacos(episodeRoot)
  // Um caminho raso demais pra ter mãe: o episódio vira grupo de si mesmo em
  // vez de cair num grupo vazio junto com todos os outros casos estranhos.
  if (partes.length < 2) return episodeRoot
  const sep = episodeRoot.includes('\\') ? '\\' : '/'
  return partes.slice(0, -1).join(sep)
}

/**
 * Ordem dentro de uma temporada: episódios primeiro, depois aberturas,
 * depois encerramentos.
 *
 * Uma abertura numerada 1 não é "antes do episódio 1" — ela pertence à
 * temporada inteira. Misturada na numeração, a OP1 aparecia empurrando o E01
 * pra baixo toda vez.
 */
const PESO: Record<EpisodeKind, number> = { '': 0, OP: 1, ED: 2, MOVIE: 3 }

/** Compara ignorando maiúsculas e acentos, do jeito que gente ordena. */
const porNome = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/**
 * Agrupa o histórico em anime → temporada → episódio.
 *
 * Puro de propósito: é a única parte disto com regra de verdade, e testá-la
 * não deveria exigir montar a tela.
 */
export function agruparPorAnime(episodios: RecentEpisode[]): Anime[] {
  const grupos = new Map<string, Anime>()

  for (const ep of episodios) {
    const pasta = pastaDoAnime(ep.episodeRoot)
    // A chave normaliza caixa porque o Windows não distingue "Tensura" de
    // "tensura", e o banco guarda o que foi digitado na hora.
    const chave = pasta.toLowerCase()
    let anime = grupos.get(chave)
    if (!anime) {
      anime = {
        pasta,
        // O `||` cobre caminho sem pasta-mãe: o histórico atual não tem
        // nenhum, mas um card com o nome em branco seria impossível de
        // entender e a defesa custa uma linha.
        nome: pedacos(pasta).at(-1) || pasta || 'Sem pasta',
        titulos: [],
        temporadas: [],
        episodios: 0,
        cenas: 0
      }
      grupos.set(chave, anime)
    }
    if (!anime.titulos.includes(ep.animeTitle)) anime.titulos.push(ep.animeTitle)

    let temporada = anime.temporadas.find((t) => t.numero === ep.season)
    if (!temporada) {
      temporada = { numero: ep.season, episodios: [], cenas: 0 }
      anime.temporadas.push(temporada)
    }
    temporada.episodios.push(ep)
    temporada.cenas += ep.shotCount
    anime.episodios += 1
    anime.cenas += ep.shotCount
  }

  const lista = [...grupos.values()]
  for (const anime of lista) {
    anime.titulos.sort(porNome.compare)
    anime.temporadas.sort((a, b) => a.numero - b.numero)
    for (const t of anime.temporadas) {
      t.episodios.sort(
        (a, b) => PESO[a.kind] - PESO[b.kind] || a.episode - b.episode
      )
    }
  }
  lista.sort((a, b) => porNome.compare(a.nome, b.nome))
  return lista
}

/**
 * Filtra pelo texto digitado, mantendo a árvore.
 *
 * Casar no nome do anime preserva o anime INTEIRO — procurar "tensura" e
 * receber só os episódios cujo número contém "tensura" (nenhum) seria uma
 * busca que não encontra o que está bem ali.
 */
export function filtrar(animes: Anime[], busca: string): Anime[] {
  const alvo = busca.trim().toLowerCase()
  if (!alvo) return animes
  const bate = (t: string): boolean => t.toLowerCase().includes(alvo)

  const saida: Anime[] = []
  for (const anime of animes) {
    if (bate(anime.nome) || anime.titulos.some(bate)) {
      saida.push(anime)
      continue
    }
    const temporadas = anime.temporadas
      .map((t) => ({
        ...t,
        episodios: t.episodios.filter((e) => bate(e.animeTitle))
      }))
      .filter((t) => t.episodios.length > 0)
    if (temporadas.length > 0) saida.push({ ...anime, temporadas })
  }
  return saida
}
