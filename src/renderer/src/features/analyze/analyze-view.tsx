import { Sparkles, Wand2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAnalysisStore } from '@/stores/analysis-store'
import { parseMmss, useEpisodeStore } from '@/stores/episode-store'
import { DiscoveryDialog } from './discovery-dialog'
import { EpisodeForm } from './episode-form'
import { ModeCards } from './mode-cards'
import { NeedsInputDialog } from './needs-input-dialog'
import { ProgressPanel } from './progress-panel'
import { ReanalyzeDialog, type ReanalyzeChoice } from './reanalyze-dialog'

export function AnalyzeView(): JSX.Element {
  const ep = useEpisodeStore()
  const { status, begin, apply, needsInput, dismissNeedsInput, discovery, discoveryMedia, clearDiscovery } =
    useAnalysisStore()
  const [startError, setStartError] = useState<string | null>(null)
  /** Resolve com a escolha do usuário quando o diálogo de reanálise abre. */
  const [pendingChoice, setPendingChoice] = useState<
    ((choice: ReanalyzeChoice) => void) | null
  >(null)

  const running = status === 'running'

  useEffect(() => {
    void ep.hydrate()
    // Assina o stream do backend UMA vez, no mount da aba. A assinatura
    // precisa sobreviver a re-renders, por isso o array de deps vazio.
    return window.ancut.analysis.onEvent(apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Abre o diálogo de reanálise e espera a escolha. */
  const askReanalyze = (): Promise<ReanalyzeChoice> =>
    new Promise((resolve) => {
      setPendingChoice(() => (choice: ReanalyzeChoice) => {
        setPendingChoice(null)
        resolve(choice)
      })
    })

  const start = async (opts: { aiReview?: boolean; discovery?: boolean }): Promise<void> => {
    setStartError(null)
    const problem = validate(ep, Boolean(opts.discovery))
    if (problem) {
      setStartError(problem)
      return
    }

    // Reanálise: perguntar ANTES de rodar. Substituir sem avisar apagaria o
    // que a análise anterior identificou. Não vale pro Modo Descoberta, que
    // tem fluxo próprio.
    let mergePrevious = false
    if (!opts.discovery) {
      const exists = await window.ancut.episode.hasAnalysis(
        ep.videoPath,
        ep.anime.trim(),
        ep.season,
        ep.episode
      )
      if (exists) {
        const choice = await askReanalyze()
        if (choice === 'cancel') return
        mergePrevious = choice === 'merge'
      }
    }

    begin()
    try {
      await window.ancut.analysis.start({
        videoPath: ep.videoPath,
        anime: ep.anime.trim(),
        season: ep.season,
        episode: ep.episode,
        outputDir: ep.outputDir.trim(),
        skipHeadSeconds: parseMmss(ep.skipHead),
        skipTailSeconds: parseMmss(ep.skipTail),
        params: ep.params,
        aiReview: Boolean(opts.aiReview),
        discovery: Boolean(opts.discovery),
        mergePrevious,
        skipCreditShots: ep.skipCreditShots,
        useDanbooru: ep.useDanbooru,
        renderExportMode: ep.renderExportMode
      })
    } catch (e) {
      // O start falhou antes do backend subir (ex.: sidecar não encontrado):
      // o stream nunca vai emitir nada, então o erro tem que vir por aqui.
      apply({
        type: 'failed',
        message: e instanceof Error ? e.message : 'Falha ao iniciar a análise.'
      })
    }
  }

  return (
    <div className="animate-rise-in mx-auto flex h-full w-full max-w-5xl flex-col gap-3">
      <EpisodeForm disabled={running} />
      <ModeCards disabled={running} />

      {startError && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[12.5px] text-warning">
          {startError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2 py-0.5">
        {running ? (
          <Button
            variant="danger"
            size="lg"
            className="gap-1.5"
            onClick={() => void window.ancut.analysis.cancel()}
          >
            <X />
            Cancelar análise
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              className="gap-1.5"
              onClick={() => void start({ discovery: true })}
              title="Agrupa os rostos do próprio episódio por semelhança e você dá os nomes no fim."
            >
              <Wand2 />
              Modo Descoberta
            </Button>
            <Button variant="primary" size="lg" onClick={() => void start({})}>
              Analisar episódio
            </Button>
            <Button
              variant="special"
              size="lg"
              className="gap-1.5"
              onClick={() => void start({ aiReview: true })}
              title="Manda só os shots duvidosos pra IA desempatar. Precisa de API key."
            >
              <Sparkles />
              Analisar + IA
            </Button>
          </>
        )}
      </div>

      <ProgressPanel />

      <ReanalyzeDialog
        open={pendingChoice !== null}
        onChoose={(choice) => pendingChoice?.(choice)}
      />

      {discovery && (
        <DiscoveryDialog
          discovery={discovery}
          mediaPrefix={discoveryMedia}
          onCommit={(names, removed) => {
            void window.ancut.analysis.commitDiscovery(names, removed)
            clearDiscovery()
          }}
          onCancel={() => {
            void window.ancut.analysis.cancel()
            clearDiscovery()
          }}
        />
      )}

      <NeedsInputDialog
        event={needsInput}
        onDismiss={dismissNeedsInput}
        onDiscovery={() => {
          dismissNeedsInput()
          void start({ discovery: true })
        }}
      />
    </div>
  )
}

/** Devolve a mensagem do primeiro problema encontrado, ou null. */
function validate(
  ep: { videoPath: string; anime: string; outputDir: string },
  _discovery: boolean
): string | null {
  if (!ep.videoPath) return 'Selecione um arquivo de vídeo.'
  if (!ep.anime.trim()) return 'Informe o nome do anime.'
  if (!ep.outputDir.trim()) return 'Escolha uma pasta de saída.'
  return null
}
