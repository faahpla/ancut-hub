import { Film, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ContextMenu } from '@/components/ui/context-menu'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { TODAS_AS_CENAS, useResultsStore } from '@/stores/results-store'
import { cn } from '@/lib/utils'
import type { CharacterSummary } from '@shared/types'

/**
 * Lista de personagens com a contagem numa coluna à direita.
 *
 * Na versão Qt isto era um delegate pintado à mão — nome e número eram uma
 * string só, então cada linha terminava num ponto diferente. Em CSS o
 * alinhamento é `justify-between` e acabou.
 */
export function CharacterList(): JSX.Element {
  const { results, selectedCharacter, selectCharacter, removeCharacter } = useResultsStore()
  const characters = results?.characters ?? []
  const [menu, setMenu] = useState<{ x: number; y: number; c: CharacterSummary } | null>(null)
  const [removendo, setRemovendo] = useState<CharacterSummary | null>(null)
  const [ocupado, setOcupado] = useState(false)

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
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({ x: e.clientX, y: e.clientY, c })
                }}
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

        {menu && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            items={[
              {
                label: `Remover ${menu.c.name} deste episódio…`,
                icon: UserMinus,
                danger: true,
                onSelect: () => setRemovendo(menu.c)
              }
            ]}
          />
        )}

        {/* Nenhum personagem com cenas suficientes. Sem esta explicação a
            tela parece um erro — o usuário batizou gente no Modo Descoberta e
            não vê ninguém aqui. */}
        {results && characters.length === 0 && (
          <li className="mt-2 rounded-md border border-border bg-surface-sunken px-2.5 py-2">
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Ninguém alcançou o <strong className="font-semibold">mínimo de
              cenas por personagem</strong>. As {results.totalShots} cenas estão
              todas em "Todas as cenas" — pra ver os personagens, baixe o mínimo
              em Configurações e analise de novo.
            </p>
          </li>
        )}
      </ul>

      {/* Reconhecimento errado: uma "Kamado, Hanako" com 21 cenas que não é
          ninguém. Isto tira o VÍNCULO, não as cenas — e é o que faltava pra
          não ter que reanalisar o episódio inteiro por causa de um engano. */}
      <Dialog open={!!removendo} onOpenChange={() => !ocupado && setRemovendo(null)}>
        {removendo && (
          <DialogContent
            title={`Remover ${removendo.name} deste episódio?`}
            description="O reconhecimento errou e este personagem não deveria estar aqui."
            onClose={() => !ocupado && setRemovendo(null)}
            footer={
              <>
                <Button variant="ghost" disabled={ocupado} onClick={() => setRemovendo(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  disabled={ocupado}
                  onClick={async () => {
                    setOcupado(true)
                    try {
                      await removeCharacter(removendo.id)
                      setRemovendo(null)
                    } finally {
                      setOcupado(false)
                    }
                  }}
                >
                  {ocupado ? 'Removendo…' : 'Remover'}
                </Button>
              </>
            }
          >
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[12.5px] leading-relaxed text-muted-foreground">
              <li>
                As <strong className="font-semibold text-foreground">
                  {removendo.shotCount} cenas continuam existindo
                </strong>{' '}
                — elas só deixam de ser dele, e seguem em "Todas as cenas".
              </li>
              <li>
                A pasta <code className="rounded bg-surface-sunken px-1">
                  by_character/{removendo.name}/
                </code>{' '}
                some. É só atalho pros clipes; nenhum arquivo de verdade é apagado.
              </li>
              <li>
                A correção <strong className="font-semibold text-foreground">
                  sobrevive a uma nova análise
                </strong>{' '}
                deste episódio.
              </li>
            </ul>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
