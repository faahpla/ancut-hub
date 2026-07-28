import { Film } from 'lucide-react'
import { TODAS_AS_CENAS, useResultsStore } from '@/stores/results-store'
import { cn } from '@/lib/utils'

/**
 * Lista de personagens com a contagem numa coluna à direita.
 *
 * Na versão Qt isto era um delegate pintado à mão — nome e número eram uma
 * string só, então cada linha terminava num ponto diferente. Em CSS o
 * alinhamento é `justify-between` e acabou.
 */
export function CharacterList(): JSX.Element {
  const { results, selectedCharacter, selectCharacter } = useResultsStore()
  const characters = results?.characters ?? []

  return (
    <div className="panel flex min-h-0 flex-col overflow-hidden">
      <header className="flex items-baseline justify-between px-3.5 pb-2 pt-3">
        <h2 className="text-[13px] font-semibold text-muted-foreground">Personagens</h2>
        <span className="tabular text-[11px] text-muted-foreground/70">
          {characters.length}
        </span>
      </header>

      <ul className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-2">
        {/* "Todas as cenas" primeiro: um corte partido no meio de uma cena só
            aparece inteiro na linha do tempo, não na pasta de um personagem. */}
        {results && (
          <li>
            <button
              type="button"
              onClick={() =>
                void selectCharacter({
                  id: TODAS_AS_CENAS,
                  name: 'Todas as cenas',
                  shotCount: results.totalShots
                })
              }
              className={cn(
                'mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                selectedCharacter?.id === TODAS_AS_CENAS
                  ? 'bg-primary/[0.12]'
                  : 'hover:bg-surface-hover'
              )}
            >
              <span
                className={cn(
                  'h-4 w-[3px] shrink-0 rounded-full transition-colors',
                  selectedCharacter?.id === TODAS_AS_CENAS ? 'bg-primary' : 'bg-transparent'
                )}
              />
              <Film className="size-3.5 shrink-0 text-muted-foreground" />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[13px]',
                  selectedCharacter?.id === TODAS_AS_CENAS
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                Todas as cenas
              </span>
              <span
                className={cn(
                  'tabular shrink-0 text-[11.5px]',
                  selectedCharacter?.id === TODAS_AS_CENAS
                    ? 'text-primary'
                    : 'text-muted-foreground/60'
                )}
              >
                {results.totalShots}
              </span>
            </button>
          </li>
        )}
        {characters.map((c) => {
          const active = selectedCharacter?.id === c.id
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => void selectCharacter(c)}
                title={c.name}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                  active ? 'bg-primary/[0.12]' : 'hover:bg-surface-hover'
                )}
              >
                {/* Indicador lateral do item ativo (padrão Discord). */}
                <span
                  className={cn(
                    'h-4 w-[3px] shrink-0 rounded-full transition-colors',
                    active ? 'bg-primary' : 'bg-transparent'
                  )}
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-[13px]',
                    active ? 'font-semibold text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {c.name}
                </span>
                <span
                  className={cn(
                    'tabular shrink-0 text-[11.5px]',
                    active ? 'text-primary' : 'text-muted-foreground/60'
                  )}
                >
                  {c.shotCount}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
