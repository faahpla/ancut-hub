import { Check } from 'lucide-react'
import { Panel } from '@/components/ui/panel'
import { PRESETS } from '@/stores/analysis-store'
import { useEpisodeStore } from '@/stores/episode-store'
import { cn } from '@/lib/utils'
import type { PresetKey } from '@shared/types'

const ORDER: PresetKey[] = ['strict', 'auto', 'loose']

export function ModeCards({ disabled }: { disabled: boolean }): JSX.Element {
  const preset = useEpisodeStore((s) => s.preset)
  const choose = useEpisodeStore((s) => s.choosePreset)

  return (
    <Panel step="2" title="Modo de reconhecimento" compact>
      <div className="grid grid-cols-3 gap-2.5">
        {ORDER.map((key) => {
          const p = PRESETS[key]
          const active = preset === key
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => choose(key)}
              className={cn(
                'relative rounded-md border p-3 text-left transition-all',
                'disabled:cursor-not-allowed disabled:opacity-60',
                active
                  ? 'border-primary/60 bg-primary/[0.07] shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]'
                  : 'border-border bg-surface-sunken/40 hover:border-muted hover:bg-surface-hover/50'
              )}
            >
              {active && (
                <span className="absolute right-2.5 top-2.5 grid size-4 place-items-center rounded-full bg-primary">
                  <Check className="size-3 stroke-[3] text-primary-foreground" />
                </span>
              )}
              <div
                className={cn(
                  'pr-5 text-[13px] font-semibold',
                  active ? 'text-foreground' : 'text-foreground/90'
                )}
              >
                {p.label}
              </div>
              <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                {p.desc}
              </div>
            </button>
          )
        })}
      </div>
    </Panel>
  )
}
