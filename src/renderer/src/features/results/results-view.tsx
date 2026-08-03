import { Clapperboard, FolderOpen, FolderSearch, History, Images, Loader2, X } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { episodeLabel } from '@/lib/utils'
import { useResultsStore } from '@/stores/results-store'
import { CharacterList } from './character-list'
import { ExplorerSyncBar } from './explorer-sync-bar'
import { BenchmarkButton } from './benchmark-button'
import { HarvestButton } from './harvest-button'
import { PreviewPlayer } from './preview-player'
import { ShotGrid } from './shot-grid'

export function ResultsView(): JSX.Element {
  const { results, loadRecent, close } = useResultsStore()

  useEffect(() => {
    void loadRecent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!results) return <EpisodePicker />

  return (
    <div className="animate-fade-in flex h-full flex-col gap-2.5">
      <header className="flex shrink-0 items-center gap-3">
        <h1 className="truncate text-[15px] font-bold">
          {results.animeTitle}
          <span className="ml-2 font-medium text-muted-foreground">
            {episodeLabel(results.season, results.episode, results.kind)}
          </span>
        </h1>
        <span className="text-[12px] text-muted-foreground">
          {results.totalShots} cenas · {results.characters.length} personagens
        </span>
        <span className="flex-1" />
        <BenchmarkButton
          episodeId={results.episodeId}
          label={`${results.animeTitle} ${episodeLabel(results.season, results.episode, results.kind)}`}
        />
        <HarvestButton episodeId={results.episodeId} />
        {results.refsDir && (
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            title="Onde ficam as fotos de referência usadas pra reconhecer os personagens"
            onClick={() => void window.ancut.shell.open(results.refsDir as string)}
          >
            <Images />
            Pasta de refs
          </Button>
        )}
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => void window.ancut.shell.reveal(results.episodeRoot)}
        >
          <FolderOpen />
          Abrir pasta
        </Button>
        <Button size="sm" variant="ghost" onClick={close} title="Voltar à lista">
          <X />
        </Button>
      </header>

      <ExplorerSyncBar />

      <div className="grid min-h-0 flex-1 grid-cols-[210px_1fr_330px] gap-2.5">
        <CharacterList />
        <ShotGrid />
        <PreviewPlayer />
      </div>
    </div>
  )
}

/**
 * Lista de episódios já analisados.
 *
 * Isto resolve a dor antiga do app Qt: fechar o programa apagava os
 * resultados e só uma reanálise (10+ min) trazia de volta. Agora a pasta de
 * saída fica gravada no banco e o resultado reabre na hora.
 */
function EpisodePicker(): JSX.Element {
  const { recent, loadingRecent, openEpisode, orphans, restoring, restoreOrphan } =
    useResultsStore()

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
        <div className="flex max-w-[320px] flex-col items-center gap-2 text-center">
          <Clapperboard className="size-8 text-muted-foreground/50" />
          <p className="text-[14px] font-semibold">Nenhum episódio analisado</p>
          <p className="text-[12.5px] text-muted-foreground">
            Analise um episódio na aba Analisar — ele aparece aqui e continua
            disponível nas próximas vezes que você abrir o app.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-rise-in mx-auto flex w-full max-w-3xl flex-col gap-3 py-2">
      <header className="flex items-center gap-2 px-1">
        <History className="size-4 text-muted-foreground" />
        <h1 className="text-[14px] font-semibold">Episódios analisados</h1>
        <span className="text-[12px] text-muted-foreground">({recent.length})</span>
      </header>

      <ul className="flex flex-col gap-1.5">
        {recent.map((ep) => (
          <li key={ep.episodeId}>
            <button
              type="button"
              onClick={() => void openEpisode(ep.episodeId)}
              className="panel flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-hover"
            >
              <Clapperboard className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {ep.animeTitle}
              </span>
              <span className="tabular shrink-0 text-[12px] text-muted-foreground">
                {episodeLabel(ep.season, ep.episode, ep.kind)}
              </span>
              <span className="tabular w-20 shrink-0 text-right text-[12px] text-muted-foreground/70">
                {ep.shotCount} cenas
              </span>
            </button>
          </li>
        ))}
      </ul>

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
