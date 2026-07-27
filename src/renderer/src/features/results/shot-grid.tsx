import { Loader2 } from 'lucide-react'
import { mediaUrl, useResultsStore } from '@/stores/results-store'
import { cn } from '@/lib/utils'
import type { ShotRow } from '@shared/types'

/**
 * Grade de cenas. O controle de escala é uma variável CSS na grade —
 * `repeat(auto-fill, minmax(<largura>, 1fr))` reflui sozinho e o número de
 * colunas sai da largura disponível, sem cálculo manual.
 */
export function ShotGrid(): JSX.Element {
  const {
    shots,
    loadingShots,
    selectedCharacter,
    mediaPrefix,
    activeShot,
    setActiveShot,
    cardWidth,
    setCardWidth
  } = useResultsStore()

  return (
    <div className="panel flex min-h-0 flex-col overflow-hidden">
      <header className="flex items-center gap-3 px-3.5 pb-2 pt-3">
        <h2 className="truncate text-[13px] font-semibold">
          {selectedCharacter ? selectedCharacter.name : 'Cenas'}
          {selectedCharacter && (
            <span className="ml-2 font-normal text-muted-foreground">
              {shots.length} cenas
            </span>
          )}
        </h2>
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Escala
          <input
            type="range"
            min={130}
            max={340}
            step={10}
            value={cardWidth}
            onChange={(e) => setCardWidth(Number(e.target.value))}
            className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
        </label>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-3">
        {loadingShots ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : shots.length === 0 ? (
          <div className="grid h-full place-items-center text-[13px] text-muted-foreground">
            Nenhuma cena para este personagem.
          </div>
        ) : (
          <div
            className="grid gap-2.5"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`
            }}
          >
            {shots.map((shot) => (
              <ShotCard
                key={shot.id}
                shot={shot}
                prefix={mediaPrefix}
                active={activeShot?.id === shot.id}
                onSelect={() => setActiveShot(shot)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ShotCard({
  shot,
  prefix,
  active,
  onSelect
}: {
  shot: ShotRow
  prefix: string
  active: boolean
  onSelect: () => void
}): JSX.Element {
  const thumb = mediaUrl(prefix, shot.keyframe)
  const conf = shot.confidence

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group overflow-hidden rounded-md border bg-surface-sunken text-left transition-all',
        active
          ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.4)]'
          : 'border-border hover:border-muted'
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-black/40">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            draggable={false}
            className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid size-full place-items-center text-[11px] text-muted-foreground">
            sem keyframe
          </div>
        )}
        <span
          className={cn(
            'tabular absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
            conf >= 0.9
              ? 'bg-primary/85 text-primary-foreground'
              : conf >= 0.8
                ? 'bg-surface/90 text-foreground'
                : 'bg-warning/85 text-warning-foreground'
          )}
        >
          {conf.toFixed(2)}
        </span>
      </div>
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="tabular text-[11px] text-muted-foreground">
          #{String(shot.idx).padStart(4, '0')}
        </span>
        <span className="tabular text-[11px] text-muted-foreground/70">
          {shot.duration.toFixed(1)}s
        </span>
      </div>
    </button>
  )
}
