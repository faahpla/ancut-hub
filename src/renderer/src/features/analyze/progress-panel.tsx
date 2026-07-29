import { AlertCircle, Check, CircleSlash, FolderOpen, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { cn, formatClock, formatDuration } from '@/lib/utils'
import { useAnalysisStore, type StageState } from '@/stores/analysis-store'
import { ProgressRing } from './progress-ring'

export function ProgressPanel(): JSX.Element {
  const { status, stages, overall, statusText, elapsed, eta, result, error, timings } =
    useAnalysisStore()

  const idle = status === 'idle'
  const tone =
    status === 'failed' ? 'destructive' : status === 'cancelled' ? 'muted' : 'primary'

  // Etapa mais cara do run — é o que responde "por que demorou tanto".
  const slowest =
    timings &&
    Object.entries(timings.stages).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]

  return (
    // `min-h-0` junto do `flex-1`: sem ele o painel se recusa a encolher
    // abaixo do próprio conteúdo (é o `min-height: auto` do flex), cresce
    // além da janela e a borda de baixo sai cortada no rodapé.
    <Panel step="3" title="Progresso da análise" className="min-h-0 flex-1">
      <div className="flex items-center gap-6">
        <ProgressRing
          value={overall}
          tone={tone}
          label={idle ? '—' : `${Math.round(overall * 100)}%`}
          sublabel={idle ? 'aguardando' : status === 'running' ? 'analisando' : undefined}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p
            className={cn(
              'text-[13px] leading-snug',
              status === 'failed' ? 'text-destructive' : 'text-foreground'
            )}
          >
            {statusText || 'Selecione um episódio e clique em Analisar.'}
          </p>

          <div className="flex flex-wrap gap-2">
            <Stat label="Decorrido" value={idle ? '—' : formatClock(elapsed)} />
            <Stat
              label="Restante"
              value={eta !== null && status === 'running' ? `~${formatClock(eta)}` : '—'}
            />
            {result && <Stat label="Cenas" value={String(result.totalShots)} />}
            {result && (
              <Stat label="Personagens" value={String(result.totalCharacters)} />
            )}
          </div>

          {result && (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => void window.ancut.shell.reveal(result.episodeRoot)}
              >
                <FolderOpen />
                Abrir pasta
              </Button>
            </div>
          )}

          {error?.detail && (
            <details className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
              <summary className="cursor-pointer text-[12px] font-medium text-destructive">
                Mostrar detalhes técnicos
              </summary>
              <pre className="scrollbar-thin mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                {error.detail}
              </pre>
            </details>
          )}
        </div>
      </div>

      {/* Onde o tempo foi parar — só aparece quando o run termina. */}
      {timings && slowest && (
        <div className="rounded-md border border-border/70 bg-surface-sunken/40 px-3 py-2 text-[12px]">
          <span className="text-muted-foreground">Etapa mais cara: </span>
          <span className="font-semibold">
            {stages.find((s) => s.id === slowest[0])?.label ?? slowest[0]}
          </span>
          <span className="text-muted-foreground">
            {' '}
            — {formatDuration(slowest[1] ?? 0)} de {formatDuration(timings.totalSeconds)} (
            {Math.round((100 * (slowest[1] ?? 0)) / (timings.totalSeconds || 1))}%)
          </span>
        </div>
      )}

      {/* Mesmo motivo: é esta lista que passa da conta quando a janela é
          baixa. Com `min-h-0` ela rola por dentro do painel; sem ele o
          `overflow-y-auto` nunca chega a valer. */}
      <ul className="scrollbar-thin flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        {stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} runFailed={status === 'failed'} />
        ))}
      </ul>
    </Panel>
  )
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-md border border-border/70 bg-surface-sunken/50 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="tabular text-[13px] font-semibold">{value}</div>
    </div>
  )
}

function StageRow({
  stage,
  runFailed
}: {
  stage: StageState
  runFailed: boolean
}): JSX.Element {
  const { status, label, message, fraction, seconds } = stage

  return (
    <li
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors',
        status === 'active' && 'bg-surface-hover/60'
      )}
    >
      <span className="grid size-4 shrink-0 place-items-center">
        {status === 'done' ? (
          <Check className="size-3.5 stroke-[3] text-primary" />
        ) : status === 'active' ? (
          runFailed ? (
            <AlertCircle className="size-3.5 text-destructive" />
          ) : (
            <Loader2 className="size-3.5 animate-spin text-primary" />
          )
        ) : (
          <CircleSlash className="size-3 text-muted-foreground/40" />
        )}
      </span>

      <span
        className={cn(
          'shrink-0 text-[12.5px]',
          status === 'pending'
            ? 'text-muted-foreground/50'
            : status === 'active'
              ? 'font-semibold text-foreground'
              : 'text-muted-foreground'
        )}
      >
        {label}
      </span>

      {status === 'active' && message && (
        <span className="truncate text-[12px] text-muted-foreground">— {message}</span>
      )}

      <span className="flex-1" />

      {/* Barra fina só na etapa ativa com fração conhecida. */}
      {status === 'active' && fraction !== null && (
        <span className="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        </span>
      )}

      {seconds !== undefined && seconds >= 0.05 && (
        <span className="tabular shrink-0 text-[11px] text-muted-foreground/70">
          {formatDuration(seconds)}
        </span>
      )}
    </li>
  )
}
