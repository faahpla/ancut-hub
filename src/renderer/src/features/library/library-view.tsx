import {
  ChevronRight,
  Clapperboard,
  Combine,
  FolderOpen,
  FolderSearch,
  Library,
  Loader2,
  Move,
  Search,
  X
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { episodeLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useResultsStore } from '@/stores/results-store'
import { agruparPorAnime, filtrar, type Anime } from './group-episodes'
import { MergeAnimeDialog } from './merge-anime-dialog'
import { SeasonDialog } from './season-dialog'
import type { RecentEpisode } from '@shared/types'

/**
 * O acervo em árvore: anime → temporada → episódio.
 *
 * Substitui a lista corrida que a aba Resultados mostrava. Com 28 episódios
 * a lista já obrigava a ler linha por linha pra achar um, porque a única
 * ordem era a data e o mesmo anime aparecia espalhado do topo ao fim.
 *
 * As pastas esquecidas no disco moram aqui também: procurar episódio e
 * recuperar episódio são a mesma tarefa vista de dois ângulos, e deixá-las em
 * abas diferentes faria a segunda nunca ser encontrada.
 */
export function LibraryView({
  onOpen
}: {
  onOpen: (episodeId: number) => void
}): JSX.Element {
  const {
    recent,
    loadingRecent,
    loadRecent,
    orphans,
    restoring,
    restoreOrphan,
    missingRoots
  } = useResultsStore()
  const [busca, setBusca] = useState('')
  const [abertos, setAbertos] = useState<string[]>([])
  /** Anime que o usuário quer fazer sumir dentro de outro. */
  const [juntando, setJuntando] = useState<Anime | null>(null)
  /** Episódios que vão mudar de temporada, e o rótulo do que são. */
  const [mudandoTemporada, setMudandoTemporada] = useState<{
    ids: number[]
    rotulo: string
    atual: number
  } | null>(null)

  useEffect(() => {
    void loadRecent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const animes = useMemo(() => agruparPorAnime(recent), [recent])
  const visiveis = useMemo(() => filtrar(animes, busca), [animes, busca])

  // Buscando, tudo que sobrou está aberto: filtrar pra depois ter que clicar
  // em cada resultado pra ver se era aquele não é uma busca, é uma segunda
  // busca. Com um anime só, idem — não há o que escolher.
  const buscando = busca.trim() !== ''
  const expandido = (a: Anime): boolean =>
    buscando || visiveis.length === 1 || abertos.includes(a.pasta)

  const alternar = (pasta: string): void =>
    setAbertos((atual) =>
      atual.includes(pasta) ? atual.filter((p) => p !== pasta) : [...atual, pasta]
    )

  if (loadingRecent) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (recent.length === 0 && orphans.length === 0) {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex max-w-[340px] flex-col items-center gap-2 text-center">
          <Library className="size-8 text-muted-foreground/50" />
          <p className="text-[14px] font-semibold">Biblioteca vazia</p>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Analise um episódio na aba Analisar. Ele entra aqui organizado por
            anime e temporada, e continua disponível nas próximas vezes que
            você abrir o app.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-rise-in mx-auto flex w-full max-w-3xl flex-col gap-3 py-2">
      <header className="flex items-center gap-2 px-1">
        <Library className="size-4 text-muted-foreground" />
        <h1 className="text-[14px] font-semibold">Biblioteca</h1>
        <span className="text-[12px] text-muted-foreground">
          {animes.length} {animes.length === 1 ? 'anime' : 'animes'} ·{' '}
          {recent.length} {recent.length === 1 ? 'episódio' : 'episódios'}
        </span>
        <span className="flex-1" />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar anime…"
            className="h-8 w-52 rounded-md border border-border bg-surface-sunken pl-8 pr-7 text-[12.5px] outline-none placeholder:text-muted-foreground/70 focus:border-primary/60"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </header>

      {missingRoots > 0 && (
        <p className="mx-1 rounded-md border border-warning/40 bg-warning/[0.08] px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-warning">
            {missingRoots} {missingRoots === 1 ? 'episódio' : 'episódios'} do
            histórico {missingRoots === 1 ? 'está' : 'estão'} sem pasta no disco
          </span>{' '}
          — a pasta foi movida ou apagada por fora do app, então não dá pra
          abrir. Nada foi perdido do lado do histórico; se você devolver a
          pasta pro lugar, {missingRoots === 1 ? 'ele volta' : 'eles voltam'}.
        </p>
      )}

      {visiveis.length === 0 ? (
        <p className="px-1 py-6 text-center text-[12.5px] text-muted-foreground">
          Nada com “{busca}”.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visiveis.map((anime) => (
            <li key={anime.pasta}>
              <AnimeCard
                anime={anime}
                aberto={expandido(anime)}
                onAlternar={() => alternar(anime.pasta)}
                onOpen={onOpen}
                onJuntar={() => setJuntando(anime)}
                podeJuntar={animes.length > 1}
                onMudarTemporada={setMudandoTemporada}
              />
            </li>
          ))}
        </ul>
      )}

      {juntando && (
        <MergeAnimeDialog
          origem={juntando}
          animes={animes}
          onClose={() => setJuntando(null)}
          onDone={() => {
            setJuntando(null)
            // Relê do backend em vez de remendar a lista: pasta, histórico e
            // memória de nomes mudaram todos de uma vez.
            void loadRecent()
          }}
        />
      )}

      {mudandoTemporada && (
        <SeasonDialog
          episodeIds={mudandoTemporada.ids}
          rotulo={mudandoTemporada.rotulo}
          temporadaAtual={mudandoTemporada.atual}
          onClose={() => setMudandoTemporada(null)}
          onDone={() => {
            setMudandoTemporada(null)
            void loadRecent()
          }}
        />
      )}

      {orphans.length > 0 && (
        <section className="mt-2 flex flex-col gap-1.5">
          <header className="flex items-center gap-2 px-1">
            <FolderSearch className="size-4 text-muted-foreground" />
            <h2 className="text-[14px] font-semibold">Pastas encontradas na saída</h2>
            <span className="text-[12px] text-muted-foreground">({orphans.length})</span>
          </header>
          <p className="px-1 text-[12px] leading-relaxed text-muted-foreground">
            Episódios que já foram analisados e continuam completos no disco,
            mas sumiram do histórico. Trazer de volta é leitura de arquivo —
            nada é cortado de novo.
          </p>
          {orphans.map((o) => (
            <div
              key={o.root}
              className="panel flex items-center gap-3 px-3.5 py-2.5"
              title={o.root}
            >
              <FolderSearch className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {o.anime}
              </span>
              <span className="tabular shrink-0 text-[12px] text-muted-foreground">
                {episodeLabel(o.season, o.episode, o.kind)}
              </span>
              <span className="tabular w-20 shrink-0 text-right text-[12px] text-muted-foreground/70">
                {o.shots} cenas
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={restoring !== ''}
                onClick={() => void restoreOrphan(o.root)}
              >
                {restoring === o.root ? 'Trazendo…' : 'Trazer de volta'}
              </Button>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function AnimeCard({
  anime,
  aberto,
  onAlternar,
  onOpen,
  onJuntar,
  podeJuntar,
  onMudarTemporada
}: {
  anime: Anime
  aberto: boolean
  onAlternar: () => void
  onOpen: (episodeId: number) => void
  onJuntar: () => void
  podeJuntar: boolean
  onMudarTemporada: (alvo: { ids: number[]; rotulo: string; atual: number }) => void
}): JSX.Element {
  /** Temporada cujo cabeçalho está sob o episódio sendo arrastado. */
  const [alvoArrasto, setAlvoArrasto] = useState<number | null>(null)
  const temporadas = anime.temporadas.length

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2.5 px-2 py-2">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={aberto}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-hover"
        >
          <ChevronRight
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              aberto && 'rotate-90'
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold">
              {anime.nome}
            </span>
            {/* O aviso só existe quando há discordância. Repetir o nome da
                pasta embaixo dela mesma seria ruído em 90% dos casos. */}
            {anime.titulos.length > 1 && (
              <span
                className="block truncate text-[11px] text-muted-foreground/80"
                title={anime.titulos.join('\n')}
              >
                {anime.titulos.length} títulos diferentes no histórico
              </span>
            )}
          </span>
          <span className="shrink-0 text-[11.5px] text-muted-foreground">
            {temporadas} {temporadas === 1 ? 'temporada' : 'temporadas'} ·{' '}
            {anime.episodios} {anime.episodios === 1 ? 'episódio' : 'episódios'}
          </span>
          <span className="tabular w-24 shrink-0 text-right text-[11.5px] text-muted-foreground/70">
            {anime.cenas.toLocaleString('pt-BR')} cenas
          </span>
        </button>
        {podeJuntar && (
          <Button
            size="sm"
            variant="ghost"
            title={`Juntar "${anime.nome}" com outra pasta — o mesmo anime em duas pastas`}
            onClick={onJuntar}
          >
            <Combine />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          title={anime.pasta}
          onClick={() => void window.ancut.shell.reveal(anime.pasta)}
        >
          <FolderOpen />
        </Button>
      </div>

      {aberto && (
        <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5">
          {anime.temporadas.map((t) => (
            <div key={t.numero} className="flex flex-col gap-1">
              <div
                className={cn(
                  'flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors',
                  alvoArrasto === t.numero && 'bg-primary/15 ring-1 ring-primary/50'
                )}
                // Soltar um episódio aqui move ele PRA ESTA temporada. É o
                // gesto que o FAAH pediu; o botão ao lado faz o mesmo pra
                // quem prefere digitar o número (ou pra temporada que ainda
                // não existe na lista).
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('application/x-ancut-episodio')) return
                  e.preventDefault()
                  setAlvoArrasto(t.numero)
                }}
                onDragLeave={() => setAlvoArrasto(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  setAlvoArrasto(null)
                  const cru = e.dataTransfer.getData('application/x-ancut-episodio')
                  if (!cru) return
                  const info = JSON.parse(cru) as { id: number; rotulo: string; season: number }
                  if (info.season === t.numero) return
                  onMudarTemporada({
                    ids: [info.id],
                    rotulo: info.rotulo,
                    atual: info.season
                  })
                }}
              >
                <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Temporada {t.numero}
                </h3>
                {/* "3 episódios", e não só "3": ao lado de "Temporada 3" o
                    número solto era lido como a temporada de novo. */}
                <span className="text-[11px] text-muted-foreground/60">
                  {t.episodios.length}{' '}
                  {t.episodios.length === 1 ? 'episódio' : 'episódios'} ·{' '}
                  {t.cenas.toLocaleString('pt-BR')} cenas
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  title={`Mudar a temporada destes ${t.episodios.length} episódios`}
                  onClick={() =>
                    onMudarTemporada({
                      ids: t.episodios.map((e) => e.episodeId),
                      rotulo: `Temporada ${t.numero} inteira (${t.episodios.length} episódios)`,
                      atual: t.numero
                    })
                  }
                  className="grid size-6 place-items-center rounded text-muted-foreground/70 transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <Move className="size-3.5" />
                </button>
              </div>
              <ul className="grid gap-1 sm:grid-cols-2">
                {t.episodios.map((ep) => (
                  <li key={ep.episodeId}>
                    <EpisodeRow ep={ep} onOpen={onOpen} temporada={t.numero} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EpisodeRow({
  ep,
  onOpen,
  temporada
}: {
  ep: RecentEpisode
  onOpen: (episodeId: number) => void
  temporada: number
}): JSX.Element {
  const rotulo = episodeLabel(ep.season, ep.episode, ep.kind)
  return (
    <button
      type="button"
      onClick={() => onOpen(ep.episodeId)}
      title={`${ep.animeTitle} — arraste até outra temporada pra mover`}
      draggable
      // Aqui o arrasto NÃO é cancelado, ao contrário da grade de cenas: este
      // é um arrasto interno da tela (mover de temporada), não um arrasto de
      // arquivo pro Windows. Tipo próprio pra a área de soltar saber que o
      // que vem é um episódio, e não qualquer coisa arrastada de fora.
      onDragStart={(e) => {
        e.dataTransfer.setData(
          'application/x-ancut-episodio',
          JSON.stringify({ id: ep.episodeId, rotulo, season: temporada })
        )
        e.dataTransfer.effectAllowed = 'move'
      }}
      className="flex w-full cursor-grab items-center gap-2 rounded-md border border-transparent bg-surface-sunken px-2.5 py-1.5 text-left transition-colors hover:border-border hover:bg-surface-hover active:cursor-grabbing"
    >
      <Clapperboard className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="tabular shrink-0 text-[12px] font-semibold">{rotulo}</span>
      <span className="flex-1" />
      <span className="tabular shrink-0 text-[11.5px] text-muted-foreground/70">
        {ep.shotCount} cenas
      </span>
    </button>
  )
}
