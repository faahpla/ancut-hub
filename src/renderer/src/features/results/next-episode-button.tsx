import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { agruparPorAnime, pastaDoAnime } from '@/features/library/group-episodes'
import { episodeLabel } from '@/lib/utils'
import { useResultsStore } from '@/stores/results-store'
import type { RecentEpisode } from '@shared/types'

/** Mesma pasta, escrita de qualquer jeito: barras e maiúsculas não contam. */
function normalizar(caminho: string): string {
  return caminho.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase()
}

/**
 * Anterior / Próximo episódio do mesmo anime.
 *
 * Pedido de quem corta vários pela fila e depois senta pra identificar um
 * por um: o caminho era voltar à Biblioteca, achar o anime, achar a
 * temporada, achar o episódio — a cada episódio. Aqui é um clique.
 *
 * A ordem é a da Biblioteca (mesma função), porque "próximo" tem que ser o
 * que a pessoa vê embaixo daquele na lista: temporada, depois episódio,
 * aberturas e encerramentos no fim da temporada.
 *
 * Troca o episódio NA MESMA ABA em vez de abrir outra: andar por uma
 * temporada de 24 episódios deixaria 24 abas na tira.
 */
export function NextEpisodeButton(): JSX.Element | null {
  const { recent, loadRecent, loadingRecent, results, openEpisode, fecharAba } =
    useResultsStore()

  // O histórico só é carregado quando a Biblioteca abre — e quem chega aqui
  // pelo "Ver" da fila talvez nunca tenha passado por ela. Também recarrega
  // quando o episódio aberto não está na lista: ela está velha.
  const naLista = results ? recent.some((e) => e.episodeId === results.episodeId) : true
  useEffect(() => {
    if (!naLista && !loadingRecent) void loadRecent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naLista])

  const vizinhos = useMemo((): { anterior?: RecentEpisode; proximo?: RecentEpisode } => {
    if (!results) return {}
    const pasta = normalizar(pastaDoAnime(results.episodeRoot))
    const anime = agruparPorAnime(recent).find((a) => normalizar(a.pasta) === pasta)
    if (!anime) return {}
    const ordem = anime.temporadas.flatMap((t) => t.episodios)
    const i = ordem.findIndex((e) => e.episodeId === results.episodeId)
    if (i < 0) return {}
    return { anterior: ordem[i - 1], proximo: ordem[i + 1] }
  }, [recent, results])

  if (!results || (!vizinhos.anterior && !vizinhos.proximo)) return null

  const ir = async (alvo: RecentEpisode): Promise<void> => {
    const atual = results.episodeId
    await openEpisode(alvo.episodeId)
    // Fecha a de onde saiu SÓ se a nova abriu mesmo: se o carregamento
    // falhar, fechar a atual deixaria a pessoa sem episódio nenhum na tela.
    if (useResultsStore.getState().results?.episodeId === alvo.episodeId) {
      fecharAba(atual)
    }
  }

  const rot = (e: RecentEpisode): string => episodeLabel(e.season, e.episode, e.kind)

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        size="sm"
        variant="ghost"
        disabled={!vizinhos.anterior}
        title={vizinhos.anterior ? `Anterior: ${rot(vizinhos.anterior)}` : 'Este é o primeiro'}
        onClick={() => vizinhos.anterior && void ir(vizinhos.anterior)}
      >
        <ChevronLeft />
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="gap-1"
        disabled={!vizinhos.proximo}
        title={vizinhos.proximo ? `Abrir o ${rot(vizinhos.proximo)}` : 'Este é o último'}
        onClick={() => vizinhos.proximo && void ir(vizinhos.proximo)}
      >
        {vizinhos.proximo ? `Próximo: ${rot(vizinhos.proximo)}` : 'Último episódio'}
        <ChevronRight />
      </Button>
    </div>
  )
}
