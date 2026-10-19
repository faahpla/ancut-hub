import { CheckCircle2, ChevronDown, Link2, Sparkles, Users } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { mediaUrl } from '@/stores/results-store'
import type { CastMember, DiscoveryGroup, DiscoveryReadyEvent } from '@shared/types'

const CHAVE_REFORCO = 'ancut.reforcarAposDescoberta'

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
 *
 * ## Os já conhecidos não pedem nome de novo
 *
 * Do segundo episódio em diante, a maior parte dos grupos é gente batizada
 * antes — e o agrupamento parte o mesmo personagem em vários (de frente,
 * de perfil, chibi). O motor reconhece os que batem com folga, junta os
 * pedaços e manda `known`: eles chegam com nome, numa seção fechada no topo
 * que dá pra abrir e corrigir. A lista principal fica só com o que é novo.
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
    removed: Record<number, number[]>,
    /** Rodar o "Reforçar refs" sozinho quando a análise terminar. */
    reforcar: boolean
  ) => void
  onCancel: () => void
}): JSX.Element {
  // Nome preenchido só no que o motor RECONHECEU. O resto da sugestão vira
  // o botão "parece X": pré-preencher palpite fazia o grupo de pescoço
  // chegar escrito "Maomao", e apagar nome errado era metade do trabalho.
  // Motor anterior à 0.16.0 não manda `known` — aí fica como era.
  const [names, setNames] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      discovery.groups.map((g) => [g.key, g.known === false ? '' : g.suggestedName])
    )
  )
  const [verReconhecidos, setVerReconhecidos] = useState(false)
  const [removed, setRemoved] = useState<Record<number, Set<number>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [verFigurantes, setVerFigurantes] = useState(false)
  const [confirmandoSaida, setConfirmandoSaida] = useState(false)
  // Lembrada entre um batismo e outro: quem desmarcou uma vez tinha motivo,
  // e reaparecer marcada toda vez seria brigar com a escolha. Começa
  // marcada porque o pedido foi justamente parar de esquecer.
  const [reforcar, setReforcar] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CHAVE_REFORCO) !== 'nao'
    } catch {
      return true
    }
  })
  const alternarReforco = (sim: boolean): void => {
    setReforcar(sim)
    try {
      localStorage.setItem(CHAVE_REFORCO, sim ? 'sim' : 'nao')
    } catch {
      /* sem armazenamento: vale só pra esta vez */
    }
  }

  // `minor` vem do motor; sem ele (motor velho) o piso é aplicado aqui, pra
  // a tela não voltar a ser a parede de antes só por causa de um delta.
  const ehFigurante = (g: DiscoveryGroup): boolean => !g.known && (g.minor ?? g.shots < 2)
  const reconhecidos = useMemo(
    () => discovery.groups.filter((g) => g.known),
    [discovery.groups]
  )
  const principais = useMemo(
    () => discovery.groups.filter((g) => !g.known && !ehFigurante(g)),
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
      ),
      reforcar
    )
  }

  // Foto de cada nome, pros palpites e pra galeria do campo de nome.
  const cast = discovery.cast ?? []
  const fotoDe = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of discovery.cast ?? []) {
      if (c.photo) m.set(c.name.toLowerCase(), mediaUrl(mediaPrefix, c.photo) ?? '')
    }
    return m
  }, [discovery.cast, mediaPrefix])

  const linha = (g: DiscoveryGroup): JSX.Element => (
    <GroupRow
      key={g.key}
      group={g}
      mediaPrefix={mediaPrefix}
      roster={discovery.roster}
      cast={cast}
      fotoDe={fotoDe}
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
            {reconhecidos.length > 0 && (
              <>
                {reconhecidos.length}{' '}
                {reconhecidos.length === 1 ? 'personagem reconhecido' : 'personagens reconhecidos'}{' '}
                de outros episódios, já com nome.{' '}
              </>
            )}
            {principais.length} {principais.length === 1 ? 'grupo novo' : 'grupos novos'} pra
            batizar. Deixe em branco para ignorar. <b>Dois grupos com o mesmo nome viram um
            só</b> — é assim que se junta o personagem que o agrupamento partiu em dois.
            Clique num recorte para <b>não</b> usá-lo como referência.
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
              <span className="self-center text-[12px] text-muted-foreground">
                {nomeados} {nomeados === 1 ? 'nomeado' : 'nomeados'}
              </span>
              <label
                className="mr-auto flex cursor-pointer items-center gap-1.5 self-center pl-3 text-[12px] text-muted-foreground hover:text-foreground"
                title="Quando a análise terminar, guarda os rostos mais confiáveis deste episódio como referência — o reconhecimento automático dos próximos fica melhor. Só adiciona, nunca apaga."
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={reforcar}
                  disabled={submitting}
                  onChange={(e) => alternarReforco(e.target.checked)}
                />
                Reforçar refs ao terminar
              </label>
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
          {reconhecidos.length > 0 && (
            <div className="rounded-md border border-primary/30 bg-primary/[0.04]">
              <button
                type="button"
                onClick={() => setVerReconhecidos((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-primary/[0.06]"
              >
                <CheckCircle2 className="size-4 shrink-0 text-primary" />
                <span className="font-medium">
                  {reconhecidos.length} já {reconhecidos.length === 1 ? 'conhecido' : 'conhecidos'}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {reconhecidos
                    .map((g) => (names[g.key] ?? '').trim() || '(sem nome)')
                    .join(', ')}
                </span>
                <span className="shrink-0 text-[11.5px] text-muted-foreground">
                  {verReconhecidos ? 'Fechar' : 'Revisar'}
                </span>
                <ChevronDown
                  className={cn(
                    'size-3.5 shrink-0 text-muted-foreground transition-transform',
                    verReconhecidos && 'rotate-180'
                  )}
                />
              </button>
              {verReconhecidos && (
                <div className="flex flex-col gap-2.5 border-t border-primary/20 p-2.5">
                  {reconhecidos.map(linha)}
                </div>
              )}
            </div>
          )}

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
                {figurantes.length === 1 ? 'grupo pequeno' : 'grupos pequenos'}
                <span className="text-muted-foreground/60">
                  — figurante de fundo, ou mais nuca e cabelo do que rosto
                </span>
              </button>
              {verFigurantes && figurantes.map(linha)}
            </>
          )}

          {principais.length === 0 && !verFigurantes && (
            <p className="py-8 text-center text-[12.5px] text-muted-foreground">
              {reconhecidos.length > 0
                ? 'Nenhum personagem novo neste episódio — só os já conhecidos acima.'
                : 'Nenhum grupo com cenas suficientes. Abra os grupos pequenos se quiser batizar mesmo assim.'}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Minúsculas e sem acento: "Ichigo" acha "Kurosaki, Ichigo", "joao" acha "João". */
function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function GroupRow({
  group,
  mediaPrefix,
  roster,
  cast,
  fotoDe,
  value,
  removed,
  juntaCom,
  onName,
  onToggleCrop
}: {
  group: DiscoveryGroup
  mediaPrefix: string
  roster: string[]
  cast: CastMember[]
  /** nome em minúsculas → URL da foto */
  fotoDe: Map<string, string>
  value: string
  removed: Set<number>
  juntaCom: boolean
  onName: (v: string) => void
  onToggleCrop: (idx: number) => void
}): JSX.Element {
  const named = value.trim().length > 0
  const listId = `roster-${group.key}`
  const [galeria, setGaleria] = useState(false)
  const fechar = useRef<number | null>(null)
  const temFotos = cast.some((c) => c.photo)
  // Palpites com foto (motor 0.17.0+). Sem eles, o "parece X" antigo.
  const palpites = group.candidates ?? []
  // A galeria acompanha o que está sendo DIGITADO: "grim" deixa só o
  // Grimmjow, primeiro quem tem uma palavra começando assim, depois quem só
  // contém. Ao abrir (foco) ela mostra o elenco inteiro mesmo com nome no
  // campo — clicar num grupo já batizado é querer TROCAR o nome. A 1.32.0
  // confundia as duas coisas e nunca filtrava: qualquer texto no campo
  // contava como "já batizado", e o Grimmjow ficava pra achar rolando.
  const [digitou, setDigitou] = useState(false)
  const filtro = normalizar(value.trim())
  const visiveis = useMemo(() => {
    if (!digitou || !filtro) return cast
    const comeca: CastMember[] = []
    const contem: CastMember[] = []
    for (const c of cast) {
      const n = normalizar(c.name)
      if (n.split(/[\s,.'-]+/).some((p) => p.startsWith(filtro)) || n.startsWith(filtro)) {
        comeca.push(c)
      } else if (n.includes(filtro)) {
        contem.push(c)
      }
    }
    return [...comeca, ...contem]
  }, [cast, digitou, filtro])
  const filtrando = digitou && filtro !== ''

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
        {palpites.length > 0 ? (
          <div className="flex items-center gap-1.5">
            {palpites.map((c, i) => {
              const foto = fotoDe.get(c.name.toLowerCase())
              const escolhido = value.trim().toLowerCase() === c.name.toLowerCase()
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => onName(c.name)}
                  title={`${c.name} — semelhança ${c.sim.toFixed(2)}`}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-[11.5px] font-medium transition-colors',
                    escolhido
                      ? 'border-primary bg-primary/20 text-foreground'
                      : i === 0
                        ? 'border-accent/50 bg-accent/10 text-accent hover:bg-accent/20'
                        : 'border-border text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                  )}
                >
                  {foto ? (
                    <img src={foto} alt="" className="size-6 rounded-full object-cover" />
                  ) : (
                    <Sparkles className="ml-1 size-3" />
                  )}
                  {c.name}
                </button>
              )
            })}
          </div>
        ) : group.suggestedName && (
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

        <div className="relative w-56 shrink-0">
          <Input
            value={value}
            onChange={(e) => {
              onName(e.target.value)
              setDigitou(true)
              if (temFotos) setGaleria(true)
            }}
            placeholder={temFotos ? 'Nome — ou escolha pela foto' : 'Nome (vazio = ignorar)'}
            // Com fotos, a galeria substitui o autocompletar: duas listas
            // abrindo juntas debaixo do campo brigavam pelo mesmo espaço.
            list={!temFotos && roster.length > 0 ? listId : undefined}
            onFocus={() => {
              if (fechar.current) window.clearTimeout(fechar.current)
              setDigitou(false)
              if (temFotos) setGaleria(true)
            }}
            // O clique numa foto tira o foco do campo ANTES de virar clique:
            // fechar na hora sumiria com a foto debaixo do mouse.
            onBlur={() => {
              fechar.current = window.setTimeout(() => setGaleria(false), 150)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setGaleria(false)
              // Enter escolhe o primeiro da lista filtrada: "grim" + Enter.
              if (e.key === 'Enter' && galeria && filtrando && visiveis.length > 0) {
                e.preventDefault()
                onName(visiveis[0].name)
                setGaleria(false)
              }
            }}
          />
          {galeria && filtrando && visiveis.length === 0 && (
            <p className="absolute right-0 top-full z-30 mt-1 w-[22rem] rounded-md border border-border bg-surface-elevated px-3 py-2 text-[11.5px] text-muted-foreground shadow-elevated">
              Ninguém do elenco com “{value.trim()}” — o nome digitado vale assim mesmo.
            </p>
          )}
          {galeria && visiveis.length > 0 && (
            <div className="scrollbar-thin absolute right-0 top-full z-30 mt-1 grid max-h-72 w-[22rem] grid-cols-4 gap-1.5 overflow-y-auto rounded-md border border-border bg-surface-elevated p-2 shadow-elevated">
              {visiveis.map((c, i) => {
                const foto = c.photo ? mediaUrl(mediaPrefix, c.photo) : null
                return (
                  <button
                    key={c.name}
                    type="button"
                    // mousedown e não click: chega antes do blur do campo.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onName(c.name)
                      setGaleria(false)
                    }}
                    title={c.name}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded p-1 text-[10.5px] leading-tight text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground',
                      // O primeiro do filtro é o que o Enter escolhe.
                      filtrando && i === 0 && 'bg-primary/15 text-foreground ring-1 ring-primary/60'
                    )}
                  >
                    {foto ? (
                      <img src={foto} alt="" loading="lazy" className="size-14 rounded object-cover" />
                    ) : (
                      <span className="grid size-14 place-items-center rounded bg-surface-sunken text-[10px]">
                        sem foto
                      </span>
                    )}
                    <span className="line-clamp-2 w-full text-center">{c.name}</span>
                  </button>
                )
              })}
            </div>
          )}
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
