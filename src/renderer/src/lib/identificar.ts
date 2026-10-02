import type { AnalysisRequest, EpisodeResults, MatchParams, MediaKind } from '@shared/types'

/** O que vem das preferências da aba Analisar. */
export interface PrefsIdentificacao {
  params: MatchParams
  skipCreditShots: boolean
  useDanbooru: boolean
  mediaKind: MediaKind
}

/**
 * A pasta de saída, deduzida da pasta do episódio.
 *
 * `episodeRoot` é `<saída>/<anime>/<S04E17>`, então subir dois níveis dá a
 * raiz. Deduzir daqui, e não ler das configurações, é o que garante que o
 * episódio seja reidentificado ONDE ELE ESTÁ: se a pasta de saída mudou
 * desde o corte, ler das configurações recortaria tudo num lugar novo.
 */
export function saidaDoEpisodio(episodeRoot: string): string {
  const sep = episodeRoot.includes('\\') ? '\\' : '/'
  return episodeRoot.split(sep).slice(0, -2).join(sep)
}

/**
 * O pedido pra identificar um episódio que já foi cortado.
 *
 * Mora fora do botão porque a fila de descoberta precisa do MESMO pedido:
 * cada detalhe aqui existe pra o episódio ser reidentificado no lugar em que
 * já está, reaproveitando o corte — uma segunda cópia montando o pedido do
 * jeito dela é como nasce duplicata.
 */
export function pedidoDeIdentificacao(
  results: EpisodeResults,
  prefs: PrefsIdentificacao,
  descoberta: boolean
): AnalysisRequest {
  return {
    videoPath: results.sourceFile,
    anime: results.animeTitle,
    season: results.season,
    episode: results.episode,
    kind: results.kind,
    outputDir: saidaDoEpisodio(results.episodeRoot),
    // Explícito: a pasta em que o episódio JÁ mora. Deixar o motor decidir
    // de novo poderia mandá-lo pra outra (a memória de pastas muda com o
    // tempo) e o episódio nasceria duplicado.
    outputFolder: results.animeFolder,
    skipHeadSeconds: 0,
    skipTailSeconds: 0,
    params: prefs.params,
    aiReview: false,
    discovery: descoberta,
    cutOnly: false,
    // O corte já existe e é o mesmo: não há nada pra mesclar com nada.
    mergePrevious: false,
    skipCreditShots: prefs.skipCreditShots,
    useDanbooru: prefs.useDanbooru,
    mediaKind: prefs.mediaKind,
    // O formato do DISCO, não o da tela. É isto que preserva o cache do
    // corte — ver `cutExportMode` em EpisodeResults.
    renderExportMode: results.cutExportMode
  }
}
