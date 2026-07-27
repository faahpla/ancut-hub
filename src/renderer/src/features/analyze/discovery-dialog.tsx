import { Sparkles, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { mediaUrl } from '@/stores/results-store'
import type { DiscoveryGroup, DiscoveryReadyEvent } from '@shared/types'

/**
 * Batismo do Modo Descoberta.
 *
 * O agrupamento achou "personagens sem nome"; aqui o usuário dá o nome de
 * cada um. Grupo sem nome é ignorado (figurante). Dois grupos com o MESMO
 * nome são fundidos pelo backend — útil quando o clustering separou o mesmo
 * personagem em dois.
 *
 * Cada recorte pode ser desmarcado: são exatamente as imagens que virariam
 * referência, e um rosto alheio infiltrado no grupo contamina o
 * reconhecimento dos próximos episódios.
 */
export function DiscoveryDialog({
  discovery,
  mediaPrefix,
  onCommit,
  onCancel
}: {
  discovery: DiscoveryReadyEvent
  mediaPrefix: string
  onCommit: (
    names: Record<number, string>,
    removed: Record<number, number[]>
  ) => void
  onCancel: () => void
}): JSX.Element {
  const [names, setNames] = useState<Record<number, string>>(() =>
    Object.fromEntries(discovery.groups.map((g) => [g.key, g.suggestedName]))
  )
  const [removed, setRemoved] = useState<Record<number, Set<number>>>({})
  const [submitting, setSubmitting] = useState(false)

  const namedCount = useMemo(
    () => Object.values(names).filter((n) => n.trim()).length,
    [names]
  )

  const toggleCrop = (key: number, idx: number): void =>
    setRemoved((prev) => {
      const set = new Set(prev[key] ?? [])
      if (set.has(idx)) set.delete(idx)
      else set.add(idx)
      return { ...prev, [key]: set }
    })

  const submit = (): void => {
    setSubmitting(true)
    onCommit(
      names,
      Object.fromEntries(
        Object.entries(removed)
          .map(([k, v]): [number, number[]] => [Number(k), Array.from(v)])
          .filter(([, v]) => v.length > 0)
      )
    )
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent
        title="Dê os nomes aos personagens descobertos"
        className="w-[min(900px,95vw)]"
        description={
          <>
            {discovery.groups.length} grupos de rostos em {discovery.totalFaces}{' '}
            detecções. Deixe em branco para ignorar (figurante). Dois grupos com o
            mesmo nome são fundidos. Clique num recorte para <b>não</b> usá-lo como
            referência.
          </>
        }
        footer={
          <>
            <Button variant="ghost" onClick={onCancel} disabled={submitting}>
              Cancelar
            </Button>
            {/* Sem nome nenhum não há o que salvar — o backend recusa com
                erro, e deixar o botão ativo só produziria um traceback. */}
            <Button
              variant="primary"
              onClick={submit}
              disabled={submitting || namedCount === 0}
              title={namedCount === 0 ? 'Dê nome a pelo menos um grupo.' : undefined}
            >
              {submitting
                ? 'Salvando...'
                : namedCount === 0
                  ? 'Dê nome a pelo menos um'
                  : `Salvar ${namedCount} personagem${namedCount === 1 ? '' : 's'}`}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2.5 pr-1">
          {discovery.groups.map((g) => (
            <GroupRow
              key={g.key}
              group={g}
              mediaPrefix={mediaPrefix}
              roster={discovery.roster}
              value={names[g.key] ?? ''}
              removed={removed[g.key] ?? new Set()}
              onName={(v) => setNames((p) => ({ ...p, [g.key]: v }))}
              onToggleCrop={(idx) => toggleCrop(g.key, idx)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GroupRow({
  group,
  mediaPrefix,
  roster,
  value,
  removed,
  onName,
  onToggleCrop
}: {
  group: DiscoveryGroup
  mediaPrefix: string
  roster: string[]
  value: string
  removed: Set<number>
  onName: (v: string) => void
  onToggleCrop: (idx: number) => void
}): JSX.Element {
  const named = value.trim().length > 0
  const listId = `roster-${group.key}`

  return (
    <div
      className={cn(
        'rounded-md border p-3 transition-colors',
        named ? 'border-primary/40 bg-primary/[0.05]' : 'border-border bg-surface-sunken/40'
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <Users className="size-3.5" />
          {group.shots} cenas · {group.faces} rostos
        </span>
        <span className="flex-1" />
        {group.suggestedName && (
          <button
            type="button"
            onClick={() => onName(group.suggestedName)}
            title={`Semelhança ${group.suggestedSim.toFixed(2)}`}
            className="flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
          >
            <Sparkles className="size-3" />
            parece {group.suggestedName}
          </button>
        )}
      </div>

      <div className="mt-2 flex gap-3">
        {/* Recortes: clicar tira/põe como referência. */}
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {group.crops.map((rel, idx) => {
            const off = removed.has(idx)
            const url = mediaUrl(mediaPrefix, rel)
            return (
              <button
                key={rel}
                type="button"
                onClick={() => onToggleCrop(idx)}
                title={off ? 'Voltar a usar como referência' : 'Não usar como referência'}
                className={cn(
                  'size-14 shrink-0 overflow-hidden rounded border transition-all',
                  off
                    ? 'border-destructive/60 opacity-30 grayscale'
                    : 'border-border hover:border-primary'
                )}
              >
                {url && (
                  <img src={url} alt="" loading="lazy" className="size-full object-cover" />
                )}
              </button>
            )
          })}
        </div>

        <div className="w-56 shrink-0">
          <Input
            value={value}
            onChange={(e) => onName(e.target.value)}
            placeholder="Nome (vazio = ignorar)"
            list={roster.length > 0 ? listId : undefined}
          />
          {/* Elenco oficial vira autocomplete quando o anime resolveu online. */}
          {roster.length > 0 && (
            <datalist id={listId}>
              {roster.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          )}
        </div>
      </div>
    </div>
  )
}
