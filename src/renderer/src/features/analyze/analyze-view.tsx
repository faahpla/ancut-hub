import {
  Check,
  ChevronDown,
  ListPlus,
  Play,
  ScanFace,
  Scissors,
  Wand2,
  X,
  type LucideIcon
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAnalysisStore } from '@/stores/analysis-store'
import { parseMmss, useEpisodeStore } from '@/stores/episode-store'
import { useQueueStore } from '@/stores/queue-store'
import type { MediaKind } from '@shared/types'
import { DiscoveryDialog } from './discovery-dialog'
import { EpisodeForm, MidiaToggle, PularPorTempo } from './episode-form'
import { ModeCards } from './mode-cards'
import { NeedsInputDialog } from './needs-input-dialog'
import { ProgressPanel } from './progress-panel'
import { QueuePanel } from './queue-panel'
import { ReanalyzeDialog, type ReanalyzeChoice } from './reanalyze-dialog'

/** O que fazer com o arquivo — antes eram quatro botões soltos no rodapé. */
type Acao = 'cortar' | 'reconhecer' | 'descobrir'

function acoes(midia: MediaKind): { valor: Acao; titulo: string; texto: string; Icone: LucideIcon }[] {
  const filme = midia === 'live'
  return [
    {
      valor: 'cortar',
      titulo: 'Só cortar',
      texto: filme
        ? 'Pica o filme em cenas e para. O certo pra filme: rápido e sem internet.'
        : 'Pica em cenas e para. Rápido, sem internet — dá pra reconhecer depois.',
      Icone: Scissors
    },
    {
      valor: 'reconhecer',
      titulo: 'Cortar e reconhecer',
      texto: filme
        ? 'Corta e diz quem é quem pelo elenco do TMDB (precisa da chave).'
        : 'Corta e já diz quem aparece em cada cena, pelo elenco do AniList.',
      Icone: ScanFace
    },
    {
      valor: 'descobrir',
      titulo: 'Modo Descoberta',
      texto: 'Junta os rostos parecidos e você dá os nomes no fim.',
      Icone: Wand2
    }
  ]
}

const ROTULO_COMECAR: Record<Acao, string> = {
  cortar: 'Cortar agora',
  reconhecer: 'Cortar e reconhecer',
  descobrir: 'Começar a Descoberta'
}

/**
 * A tela "Novo corte".
 *
 * Ordem de cima pra baixo é a ordem do gesto: soltar o vídeo, conferir o que
 * o app entendeu, escolher o que fazer, começar. O que quase nunca muda
 * (rigor do reconhecimento, pular por tempo, IA) fica em "Mais opções".
 */
export function AnalyzeView({
  onVerResultado
}: {
  /** Abrir um episódio pronto da fila leva pro episódio. */
  onVerResultado: (episodeId: number) => void
}): JSX.Element {
  const ep = useEpisodeStore()
  const { status, begin, apply, needsInput, dismissNeedsInput, discovery, discoveryMedia, clearDiscovery } =
    useAnalysisStore()
  const filaRodando = useQueueStore((s) => s.rodando)
  const [startError, setStartError] = useState<string | null>(null)
  const [acao, setAcao] = useState<Acao>('reconhecer')
  const [maisOpcoes, setMaisOpcoes] = useState(false)
  const [comIA, setComIA] = useState(false)
  /** Resolve com a escolha do usuário quando o diálogo de reanálise abre. */
  const [pendingChoice, setPendingChoice] = useState<
    ((choice: ReanalyzeChoice) => void) | null
  >(null)

  // A fila ocupa o mesmo motor: enquanto ela roda, os botões de um episódio
  // só ficam fora — apertá-los daria "já existe uma análise em andamento",
  // que é um erro sobre o funcionamento interno, não sobre o que a pessoa fez.
  const running = status === 'running' || filaRodando

  useEffect(() => {
    void ep.hydrate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Filme quase sempre é só pra cortar; anime, pra cortar e reconhecer.
  useEffect(() => {
    setAcao(ep.mediaKind === 'live' ? 'cortar' : 'reconhecer')
  }, [ep.mediaKind])

  /** Abre o diálogo de reanálise e espera a escolha. */
  const askReanalyze = (): Promise<ReanalyzeChoice> =>
    new Promise((resolve) => {
      setPendingChoice(() => (choice: ReanalyzeChoice) => {
        setPendingChoice(null)
        resolve(choice)
      })
    })

  const start = async (opts: {
    aiReview?: boolean
    discovery?: boolean
    cutOnly?: boolean
  }): Promise<void> => {
    setStartError(null)
    const problem = validate(ep)
    if (problem) {
      setStartError(problem)
      return
    }

    // Reanálise: perguntar ANTES de rodar. Substituir sem avisar apagaria o
    // que a análise anterior identificou. Não vale pro Modo Descoberta, que
    // tem fluxo próprio.
    let mergePrevious = false
    if (!opts.discovery && !opts.cutOnly) {
      const exists = await window.ancut.episode.hasAnalysis(
        ep.videoPath,
        ep.anime.trim(),
        ep.season,
        ep.episode,
        ep.kind
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
        kind: ep.kind,
        outputDir: ep.outputDir.trim(),
        outputFolder: ep.animeFolder,
        skipHeadSeconds: parseMmss(ep.skipHead),
        skipTailSeconds: parseMmss(ep.skipTail),
        params: ep.params,
        aiReview: Boolean(opts.aiReview),
        discovery: Boolean(opts.discovery),
        cutOnly: Boolean(opts.cutOnly),
        mergePrevious,
        skipCreditShots: ep.skipCreditShots,
        useDanbooru: ep.useDanbooru,
        mediaKind: ep.mediaKind,
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

  const comecar = (): void => {
    if (acao === 'cortar') void start({ cutOnly: true })
    else if (acao === 'descobrir') void start({ discovery: true })
    else void start({ aiReview: comIA })
  }

  const porNaFila = (): void => {
    setStartError(null)
    const problem = validate(ep)
    if (problem) {
      setStartError(problem)
      return
    }
    useQueueStore.getState().adicionarConferido({
      videoPath: ep.videoPath,
      anime: ep.anime.trim(),
      season: ep.season,
      episode: ep.episode,
      kind: ep.kind
    })
    // Volta pra área de soltar: o próximo vídeo já pode vir.
    ep.set({ videoPath: '', chapters: [] })
  }

  const opcoes = acoes(ep.mediaKind)

  return (
    <div className="animate-rise-in mx-auto grid w-full max-w-[1400px] grid-cols-1 items-start gap-6 min-[1360px]:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <header className="flex flex-wrap items-end gap-4">
          <div className="flex min-w-[240px] flex-1 flex-col gap-1">
            <h1 className="flex items-center gap-2.5 text-[26px] font-bold tracking-tight">
              <Scissors className="size-6 text-primary" />
              Novo corte
            </h1>
            <p className="text-[14px] text-muted-foreground">
              Solte o vídeo, confira o nome e escolha o que fazer.
            </p>
          </div>
          <MidiaToggle disabled={running} />
        </header>

        <EpisodeForm
          disabled={running}
          onVarios={(paths) => void useQueueStore.getState().adicionar(paths)}
        />

        <section className="flex flex-col gap-2.5">
          <h2 className="text-[13px] font-semibold text-muted-foreground">O que fazer</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {opcoes.map((o) => {
              const ativo = acao === o.valor
              return (
                <button
                  key={o.valor}
                  type="button"
                  disabled={running}
                  aria-pressed={ativo}
                  onClick={() => setAcao(o.valor)}
                  className={cn(
                    'relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-all',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    ativo
                      ? 'border-primary/60 bg-primary/[0.08] shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]'
                      : 'border-border bg-surface/70 hover:border-muted hover:bg-surface-hover/60'
                  )}
                >
                  {ativo && (
                    <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-primary">
                      <Check className="size-3.5 stroke-[3] text-primary-foreground" />
                    </span>
                  )}
                  <span
                    className={cn(
                      'grid size-9 place-items-center rounded-lg',
                      ativo ? 'bg-primary/20 text-primary' : 'bg-surface-elevated text-muted-foreground'
                    )}
                  >
                    <o.Icone className="size-[18px]" />
                  </span>
                  <span className="text-[14.5px] font-semibold">{o.titulo}</span>
                  <span className="text-[12.5px] leading-snug text-muted-foreground">{o.texto}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <button
            type="button"
            onClick={() => setMaisOpcoes((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className={cn('size-4 transition-transform', maisOpcoes && 'rotate-180')} />
            Mais opções
            <span className="font-normal">
              {acao === 'reconhecer'
                ? '· rigor do reconhecimento, pular abertura, revisão com IA'
                : '· pular abertura e encerramento'}
            </span>
          </button>
          {maisOpcoes && (
            <div className="flex flex-col gap-5 border-t border-border px-4 pb-4 pt-4">
              {acao === 'reconhecer' && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-[12.5px] font-semibold">Rigor do reconhecimento</h3>
                  <ModeCards disabled={running} />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <h3 className="text-[12.5px] font-semibold">Pular por tempo</h3>
                <PularPorTempo disabled={running} />
              </div>
              {acao === 'reconhecer' && (
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={comIA}
                    disabled={running}
                    onChange={(e) => setComIA(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  <span>
                    <span className="text-[13px]">Pedir pra IA desempatar as cenas duvidosas</span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
                      Manda só as cenas em que o app ficou na dúvida. Precisa da chave do
                      Gemini nas Configurações.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}
        </section>

        {startError && (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-[12.5px] text-warning">
            {startError}
          </p>
        )}

        {/* Enquanto a fila roda, quem para é o botão dela: um "Cancelar"
            aqui pararia UM episódio sem dizer que a fila seguiria. */}
        {filaRodando ? (
          <p className="text-[12.5px] text-muted-foreground">
            A fila está rodando — acompanhe e pare por ela.
          </p>
        ) : status === 'running' ? (
          <div className="flex justify-end">
            <Button
              variant="danger"
              size="lg"
              className="gap-1.5"
              onClick={() => void window.ancut.analysis.cancel()}
            >
              <X />
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {acao === 'cortar' && ep.videoPath && (
              <Button
                variant="secondary"
                size="lg"
                className="gap-1.5"
                onClick={porNaFila}
                title="Deixa este vídeo esperando na fila e libera a tela pro próximo."
              >
                <ListPlus />
                Pôr na fila
              </Button>
            )}
            <Button variant="primary" size="lg" className="gap-1.5" onClick={comecar}>
              <Play />
              {ROTULO_COMECAR[acao]}
            </Button>
          </div>
        )}

        {status !== 'idle' && <ProgressPanel />}
      </div>

      <aside className="flex min-w-0 flex-col gap-4 min-[1360px]:sticky min-[1360px]:top-0">
        <QueuePanel onVerResultado={onVerResultado} />
      </aside>

      <ReanalyzeDialog
        open={pendingChoice !== null}
        onChoose={(choice) => pendingChoice?.(choice)}
      />

      {discovery && (
        <DiscoveryDialog
          discovery={discovery}
          mediaPrefix={discoveryMedia}
          onCommit={(names, removed, reforcar) => {
            // Marcado ANTES do commit: o `done` pode chegar logo depois, e
            // quem consome o pedido precisa encontrá-lo lá.
            useAnalysisStore.getState().marcarReforco(reforcar)
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
function validate(ep: {
  videoPath: string
  anime: string
  outputDir: string
  mediaKind: MediaKind
}): string | null {
  if (!ep.videoPath) return 'Solte ou escolha um vídeo primeiro.'
  if (!ep.anime.trim()) {
    return ep.mediaKind === 'live' ? 'Informe o título do filme ou da série.' : 'Informe o nome do anime.'
  }
  if (!ep.outputDir.trim()) return 'Escolha onde salvar.'
  return null
}
