import { Clapperboard, FolderOpen, Images, Library, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { episodeLabel } from '@/lib/utils'
import { useResultsStore } from '@/stores/results-store'
import { CharacterList } from './character-list'
import { ExplorerSyncBar } from './explorer-sync-bar'
import { BenchmarkButton } from './benchmark-button'
import { HarvestButton } from './harvest-button'
import { IdentifyButton } from './identify-button'
import { PreviewPlayer } from './preview-player'
import { ShotGrid } from './shot-grid'

export function ResultsView({
  onBrowse,
  onAnalyze
}: {
  onBrowse: () => void
  /** Leva pra aba Analisar — é lá que mora a tela de progresso. */
  onAnalyze: () => void
}): JSX.Element {
  const { results, close } = useResultsStore()

  if (!results) return <SemEpisodio onBrowse={onBrowse} />

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
        <IdentifyButton results={results} onStarted={onAnalyze} />
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
        <Button
          size="sm"
          variant="ghost"
          title="Fechar e voltar à Biblioteca"
          onClick={() => {
            close()
            onBrowse()
          }}
        >
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
 * O que a aba Resultados mostra quando nenhum episódio está aberto.
 *
 * Antes daqui saía a lista inteira do histórico. Ela virou a aba Biblioteca,
 * onde os episódios ficam em árvore por anime e temporada — manter uma
 * segunda cópia da mesma lista aqui obrigaria as duas a concordarem pra
 * sempre, e a primeira divergência apareceria como "sumiu um episódio".
 */
function SemEpisodio({ onBrowse }: { onBrowse: () => void }): JSX.Element {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex max-w-[320px] flex-col items-center gap-2.5 text-center">
        <Clapperboard className="size-8 text-muted-foreground/50" />
        <p className="text-[14px] font-semibold">Nenhum episodio aberto</p>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          Escolha um episodio na Biblioteca pra revisar as cenas, mesclar,
          excluir e conferir os personagens.
        </p>
        <Button size="sm" variant="primary" className="mt-1 gap-1.5" onClick={onBrowse}>
          <Library />
          Ir para a Biblioteca
        </Button>
      </div>
    </div>
  )
}
