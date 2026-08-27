import { ChevronDown, Link2, Sparkles, Users } from 'lucide-react'
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
 * personagem em dois, que é o erro residual conhecido do agrupamento.
 *
 * Cada recorte pode ser desmarcado: são exatamente as imagens que virariam
 * referência, e um rosto alheio infiltrado no grupo contamina o
 * reconhecimento dos próximos episódios.
 *
 * ## Por que a lista principal é curta
 *
 * Um episódio devolve centenas de grupos (252 num Demon Slayer) e quase
 * todos são NPC de fundo. Perguntar o nome de todos transformava a tela numa
 * parede de rolagem, e o que interessa — os dez ou quinze que voltam toda
 * semana — ficava enterrado no meio. Os figurantes continuam aqui, atrás de
 * um botão que diz quantos são: nada some, só sai da frente.
 */
export function DiscoveryDialog({
  discovery,
  mediaPrefix,
  onCommit,
  onCancel
}: {
  discovery: DiscoveryReadyEvent
  mediaPrefix: string
  onCommit: (names: Record<number, string>, removed: Record<number, number[]>) => void
  onCancel: () => void
}): JSX.Element {
  const [names, setNames] = useState<Record<number, string>>(() =>
    Object.fromEntries(discovery.groups.map((g) => [g.key, g.suggestedName]))
  )
  const [removed, setRemoved] = useState<Record<number, Set<number>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [verFigurantes, setVerFigurantes] = useState(false)
  const [confirmandoSaida, setConfirmandoSaida] = useState(false)

  // `minor` vem do motor; sem ele (motor velho) o piso é aplicado aqui, pra
  // a tela não voltar a ser a parede de antes só por causa de um delta.
  const ehFigurante = (g: DiscoveryGroup): boolean => g.minor ?? g.shots < 2
  const principais = useMemo(
    () => discovery.groups.filter((g) => !ehFigurante(g)),
    [discovery.groups]
  )
  const figurantes = useMemo(
    () => discovery.groups.filter(ehFigurante),
    [discovery.groups]
  )

  const nomeados = useMemo(
    () => Object.values(names).filter((n) => n.trim()).length,
    [names]
  )

  /**
   * Quantos grupos cada nome tem.
   *
   * O backend funde grupos de nome igual, e isso é o conserto do erro
   * residual do agrupamento — o mesmo personagem partido em dois. Mas fundir
   * calado assusta: a linha avisa "junta com outro" quando o nome repete.
   */
  const repetidos = useMemo(() => {
    const conta = new Map<string, number>()
    for (const v of Object.values(names)) {
      const k = v.trim().toLowerCase()
      if (k) conta.set(k, (conta.get(k) ?? 0) + 1)
    }
    return conta
  }, [names])

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

  const linha = (g: DiscoveryGroup): JSX.Element => (
    <GroupRow
      key={g.key}
      group={g}
      mediaPrefix={mediaPrefix}
      roster={discovery.roster}
      value={names[g.key] ?? ''}
      removed={removed[g.key] ?? new Set()}
      juntaCom={(repetidos.get((names[g.key] ?? '').trim().toLowerCase()) ?? 0) > 1}
      onName={(v) => setNames((p) => ({ ...p, [g.key]: v }))}
      onToggleCrop={(idx) => toggleCrop(g.key, idx)}
    />
  )

  return (
    <Dialog open>
      <DialogContent
        title="Dê os nomes aos personagens descobertos"
        className="w-[min(900px,95vw)]"
        // Travado: aqui pode haver vinte nomes digitados, e um clique torto
        // fora jogava a análise inteira fora sem perguntar. Sai pelos botões.
        travado
        description={
          <>
            {principais.length} personagens com 2 ou mais cenas, de{' '}
            {discovery.groups.length} grupos em {discovery.totalFaces} rostos. Deixe em
            branco para ignorar. <b>Dois grupos com o mesmo nome viram um só</b> — é
            assim que se junta o personagem que o agrupamento partiu em dois. Clique num
            recorte para <b>não</b> usá-lo como referência.
          </>
        }
        footer={
          confirmandoSaida ? (
            <>
              <span className="mr-auto self-center text-[12px] text-danger">
                Descartar a análise inteira? Os {nomeados} nomes se perdem.
              </span>
              <Button variant="ghost" onClick={() => setConfirmandoSaida(false)}>
                Voltar
              </Button>
              <Button variant="danger" onClick={onCancel}>
                Descartar
              </Button>
            </>
          ) : (
            <>
              <span className="mr-auto self-center text-[12px] text-muted-foreground">
                {nomeados} {nomeados === 1 ? 'nomeado' : 'nomeados'}
              </span>
              <Button
                variant="ghost"
                onClick={() => (nomeados > 0 ? setConfirmandoSaida(true) : onCancel())}
                disabled={submitting}
              >
                Cancelar
              </Button>
              {/* Sem nome nenhum não há o que salvar — o backend recusa com
                  erro, e deixar o botão ativo só produziria um traceback. */}
              <Button
                variant="primary"
                onClick={submit}
                disabled={submitting || nomeados === 0}
                title={nomeados === 0 ? 'Dê nome a pelo menos um grupo.' : undefined}
              >
                {submitting
                  ? 'Salvando...'
                  : nomeados === 0
                    ? 'Dê nome a pelo menos um'
                    : `Salvar ${nomeados} ${nomeados === 1 ? 'personagem' : 'personagens'}`}
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-2.5 pr-1">
          {principais.map(linha)}

          {figurantes.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setVerFigurantes((v) => !v)}
                className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:bg-surface-hover"
              >
                <ChevronDown
                  className={cn('size-3.5 transition-transform', verFigurantes && 'rotate-180')}
                />
                {verFigurantes ? 'Esconder' : 'Mostrar'} {figurantes.length}{' '}
                {figurantes.length === 1 ? 'grupo' : 'grupos'} de uma cena só
                <span className="text-muted-foreground/60">
                  — quase sempre figurante de fundo
                </span>
              </button>
              {verFigurantes && figurantes.map(linha)}
            </>
          )}

          {principais.length === 0 && !verFigurantes && (
            <p className="py-8 text-center text-[12.5px] text-muted-foreground">
              Nenhum rosto apareceu em duas cenas ou mais. Abra os grupos de uma cena
              só se quiser batizar mesmo assim.
            </p>
          )}
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
  juntaCom,
  onName,
  onToggleCrop
}: {
  group: DiscoveryGroup
  mediaPrefix: string
  roster: string[]
  value: string
  removed: Set<number>
  juntaCom: boolean
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
          {group.shots} {group.shots === 1 ? 'cena' : 'cenas'} · {group.faces} rostos
        </span>
        {juntaCom && (
          <span
            className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
            title="Outro grupo tem este mesmo nome. Os dois viram um personagem só."
          >
            <Link2 className="size-3" />
            junta com outro grupo
          </span>
        )}
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
