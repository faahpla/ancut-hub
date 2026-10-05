import { AlertTriangle, ArrowRight, ListOrdered, Loader2, Shapes } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn, episodeLabel } from '@/lib/utils'
import type { EpisodeKind, RecentEpisode, ReclassifyPlan } from '@shared/types'
import { pastaDoAnime, type Anime } from './group-episodes'

/**
 * Organizar vários episódios de uma vez: mudar o TIPO (episódio, abertura,
 * encerramento), dar o número de cada um e juntar todos numa pasta de anime.
 *
 * O caso que trouxe isto: aberturas do Black Clover analisadas sem marcar
 * "Abertura". Cada arquivo virou um anime próprio com um S01E01 dentro, e
 * juntar uma por uma com o "juntar pastas" dava conflito na segunda — todas
 * se chamam S01E01. Aqui a OP2 vira `S01-OP2`, a OP3 vira `S01-OP3`, e todas
 * vão pra pasta "Black Clover" num clique.
 *
 * Mesmo esquema das outras operações de pasta: o plano vem antes, a pessoa vê
 * o que vira o que, e destino ocupado para tudo em vez de sobrescrever.
 */

const TIPOS: { kind: EpisodeKind; rotulo: string }[] = [
  { kind: '', rotulo: 'Episódio' },
  { kind: 'OP', rotulo: 'Abertura' },
  { kind: 'ED', rotulo: 'Encerramento' }
]

/** Valor do <select> pra "cada um fica na pasta em que já está". */
const FICA = ''
/** Valor do <select> pra digitar uma pasta que ainda não existe. */
const NOVA = '\u0000nova'

const nomeDaPasta = (ep: RecentEpisode): string =>
  pastaDoAnime(ep.episodeRoot).split(/[\\/]+/).filter(Boolean).at(-1) ?? ''

/**
 * O número que o NOME já diz: "Opening 2 v1" → 2, "ED 05" → 5.
 *
 * `\bop` sozinho não basta: em "OP Opening 2" o primeiro "OP" não tem número
 * e a busca segue até o "Opening 2", que é o certo.
 */
function numeroDoNome(texto: string): number | null {
  const m = texto.match(
    /(?:opening|ending|abertura|encerramento|\bnc ?op|\bnc ?ed|\bop|\bed)\s*[-_#.]?\s*0*(\d{1,3})(?!\d)/i
  )
  return m ? Number(m[1]) : null
}

/** O tipo que o nome sugere, pra janela já abrir no certo. */
function tipoDoNome(texto: string): EpisodeKind | null {
  if (/opening|abertura|\bnc ?op\b|\bop ?\d*\b/i.test(texto)) return 'OP'
  if (/ending|encerramento|\bnc ?ed\b|\bed ?\d*\b/i.test(texto)) return 'ED'
  return null
}

interface Linha {
  ep: RecentEpisode
  pasta: string
  marcado: boolean
  numero: string
}

export function OrganizeDialog({
  episodios,
  animes,
  onClose,
  onDone
}: {
  /** Os episódios que aparecem na lista (os da busca, ou um só). */
  episodios: RecentEpisode[]
  /** Todos os animes, pra escolher a pasta que recebe. */
  animes: Anime[]
  onClose: () => void
  onDone: () => void
}): JSX.Element {
  const umSo = episodios.length === 1

  // Palpites de partida. Tudo é editável — isto só poupa digitação no caso
  // comum, que é uma pilha de arquivos com "Opening N" no nome.
  const inicial = useMemo(() => {
    const nomes = episodios.map((e) => `${nomeDaPasta(e)} ${e.animeTitle}`)
    const tipos = nomes.map(tipoDoNome)
    const tipo: EpisodeKind = umSo
      ? (episodios[0].kind === '' ? tipos[0] ?? 'OP' : '')
      : tipos.filter((t) => t === 'OP').length >= tipos.filter((t) => t === 'ED').length
        ? 'OP'
        : 'ED'

    // A pasta que recebe: a de nome mais longo que é o começo do nome de
    // todos ("Black Clover" pra "Black Clover - OP Opening 2…").
    const pastas = [...new Set(episodios.map(nomeDaPasta))]
    const destino = umSo
      ? FICA
      : animes
          .map((a) => a.nome)
          .filter((n) => pastas.every((p) => p.toLowerCase().startsWith(n.toLowerCase())))
          .sort((a, b) => b.length - a.length)[0] ?? FICA

    // Quem já mora na pasta que recebe começa desmarcado: são os episódios
    // de verdade do anime, e quase nunca é deles que se está falando.
    const linhas: Linha[] = episodios.map((ep, i) => ({
      ep,
      pasta: nomeDaPasta(ep),
      marcado: umSo || destino === FICA || nomeDaPasta(ep).toLowerCase() !== destino.toLowerCase(),
      numero: String(numeroDoNome(nomes[i]) ?? (ep.kind ? ep.episode : 0) ?? 0)
    }))
    // Quem não tinha número no nome ganha o próximo livre, pra não nascer
    // todo mundo em conflito com o 0.
    let proximo = Math.max(0, ...linhas.map((l) => Number(l.numero) || 0))
    for (const l of linhas) if (!Number(l.numero)) l.numero = String(++proximo)
    if (umSo && tipo === '') linhas[0].numero = String(episodios[0].episode)
    return { tipo, destino, linhas }
  }, [episodios, animes, umSo])

  const [tipo, setTipo] = useState<EpisodeKind>(inicial.tipo)
  const [temporada, setTemporada] = useState(String(episodios[0]?.season ?? 1))
  const [destino, setDestino] = useState<string>(inicial.destino)
  const [novaPasta, setNovaPasta] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>(inicial.linhas)
  const [plano, setPlano] = useState<ReclassifyPlan | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  const pastaFinal = destino === NOVA ? novaPasta.trim() : destino
  const marcadas = linhas.filter((l) => l.marcado)
  const season = Number(temporada)
  const temporadaOk = Number.isInteger(season) && season >= 1 && season <= 99
  const numerosOk = marcadas.every((l) => Number.isInteger(Number(l.numero)) && Number(l.numero) >= 1)

  // Números repetidos ficam vermelhos na hora, sem esperar o motor: é o erro
  // mais provável (as "v1" e "v3" da mesma abertura).
  const repetidos = useMemo(() => {
    const vistos = new Map<string, number>()
    for (const l of marcadas) vistos.set(l.numero, (vistos.get(l.numero) ?? 0) + 1)
    return new Set([...vistos].filter(([, n]) => n > 1).map(([k]) => k))
  }, [marcadas])

  const pedido = useMemo(
    () => ({
      destino: pastaFinal,
      season,
      itens: marcadas.map((l) => ({
        episodeId: l.ep.episodeId,
        kind: tipo,
        numero: Number(l.numero)
      }))
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pastaFinal, season, tipo, JSON.stringify(marcadas.map((l) => [l.ep.episodeId, l.numero]))]
  )

  const podePedir =
    marcadas.length > 0 && temporadaOk && numerosOk && !(destino === NOVA && !pastaFinal)

  useEffect(() => {
    if (!podePedir) return setPlano(null)
    let vivo = true
    setCarregando(true)
    // Debounce: ele digita "12" e não faz sentido pedir o plano do "1".
    const t = window.setTimeout(() => {
      void window.ancut.results
        .reclassifyPlan(pedido)
        .then((p) => vivo && setPlano(p))
        .finally(() => vivo && setCarregando(false))
    }, 300)
    return () => {
      vivo = false
      window.clearTimeout(t)
      setCarregando(false)
    }
  }, [pedido, podePedir])

  const aplicar = async (): Promise<void> => {
    if (!plano?.pode) return
    setAplicando(true)
    try {
      const r = await window.ancut.results.reclassifyApply(pedido)
      if (r?.aplicado) onDone()
      else setPlano(r)
    } finally {
      setAplicando(false)
    }
  }

  const mudar = (i: number, patch: Partial<Linha>): void =>
    setLinhas((atual) => atual.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  /** 1, 2, 3… na ordem da lista, só entre os marcados. */
  const numerarEmSequencia = (): void => {
    let n = 0
    setLinhas((atual) => atual.map((l) => (l.marcado ? { ...l, numero: String(++n) } : l)))
  }

  const prefixo = tipo === 'OP' ? 'OP' : tipo === 'ED' ? 'ED' : 'E'

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        title={umSo ? 'Mudar o tipo do episódio' : 'Organizar episódios'}
        description={
          umSo
            ? 'Episódio, abertura ou encerramento — a pasta é renomeada no disco.'
            : 'Escolha o que eles são, o número de cada um e a pasta que recebe todos.'
        }
        className="w-[min(680px,94vw)]"
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={aplicando}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="gap-1.5"
              disabled={!plano?.pode || aplicando || carregando}
              onClick={() => void aplicar()}
            >
              {aplicando ? <Loader2 className="animate-spin" /> : <Shapes />}
              {plano?.pode
                ? `Organizar ${plano.mudancas.length} ${plano.mudancas.length === 1 ? 'episódio' : 'episódios'}`
                : 'Organizar'}
            </Button>
          </>
        }
      >
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface-sunken p-0.5">
              {TIPOS.map((t) => (
                <button
                  key={t.kind || 'E'}
                  type="button"
                  aria-pressed={tipo === t.kind}
                  onClick={() => setTipo(t.kind)}
                  className={cn(
                    'rounded px-2.5 py-1 text-[12px] font-medium transition-colors',
                    tipo === t.kind
                      ? 'bg-primary/20 text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t.rotulo}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2">
              Temporada
              <input
                type="number"
                min={1}
                max={99}
                value={temporada}
                onChange={(e) => setTemporada(e.target.value)}
                className="tabular w-14 rounded-md border border-border bg-surface-sunken px-2 py-1 outline-none focus:border-primary/60"
              />
            </label>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              Pasta
              <select
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-border bg-surface-sunken px-2 py-1 outline-none focus:border-primary/60"
              >
                <option value={FICA}>
                  {umSo ? 'A mesma de agora' : 'Cada um fica na pasta de agora'}
                </option>
                {animes.map((a) => (
                  <option key={a.pasta} value={a.nome}>
                    {a.nome}
                  </option>
                ))}
                <option value={NOVA}>Outra pasta (digitar o nome)…</option>
              </select>
            </label>
          </div>

          {destino === NOVA && (
            <input
              autoFocus
              value={novaPasta}
              onChange={(e) => setNovaPasta(e.target.value)}
              placeholder="Nome da pasta nova, ex.: Black Clover"
              className="rounded-md border border-border bg-surface-sunken px-2 py-1 text-[12.5px] outline-none focus:border-primary/60"
            />
          )}

          {!umSo && (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <span>
                {marcadas.length} de {linhas.length} marcados
              </span>
              <button
                type="button"
                className="underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => {
                  const todos = marcadas.length === linhas.length
                  setLinhas((a) => a.map((l) => ({ ...l, marcado: !todos })))
                }}
              >
                {marcadas.length === linhas.length ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
              <span className="flex-1" />
              <button
                type="button"
                title="Dá 1, 2, 3… aos marcados, na ordem da lista"
                className="flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
                onClick={numerarEmSequencia}
              >
                <ListOrdered className="size-3.5" />
                Numerar 1, 2, 3…
              </button>
            </div>
          )}

          <ul className="scrollbar-thin flex max-h-[38vh] flex-col gap-1 overflow-y-auto pr-1">
            {linhas.map((l, i) => {
              const repetido = l.marcado && repetidos.has(l.numero)
              return (
                <li
                  key={l.ep.episodeId}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2 py-1.5 text-[12px]',
                    l.marcado
                      ? 'border-border bg-surface-sunken'
                      : 'border-transparent bg-surface-sunken/40 text-muted-foreground'
                  )}
                >
                  {!umSo && (
                    <input
                      type="checkbox"
                      checked={l.marcado}
                      onChange={(e) => mudar(i, { marcado: e.target.checked })}
                      className="size-3.5 shrink-0 accent-primary"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate" title={`${l.pasta}\n${l.ep.animeTitle}`}>
                    {l.pasta}
                  </span>
                  <span className="tabular shrink-0 text-muted-foreground">
                    {episodeLabel(l.ep.season, l.ep.episode, l.ep.kind)}
                  </span>
                  <ArrowRight className="size-3 shrink-0 text-muted-foreground/60" />
                  <span className="tabular shrink-0 font-medium">{prefixo}</span>
                  <input
                    type="number"
                    min={1}
                    value={l.numero}
                    disabled={!l.marcado}
                    onChange={(e) => mudar(i, { numero: e.target.value })}
                    className={cn(
                      'tabular w-14 shrink-0 rounded-md border bg-surface px-1.5 py-0.5 outline-none focus:border-primary/60',
                      repetido ? 'border-danger text-danger' : 'border-border'
                    )}
                  />
                </li>
              )
            })}
          </ul>

          {repetidos.size > 0 && (
            <p className="text-[12px] text-danger">
              Tem número repetido. Duas versões da mesma abertura (v1, v3)
              precisam de números diferentes — ou use “Numerar 1, 2, 3…”.
            </p>
          )}

          {!temporadaOk && temporada !== '' && (
            <p className="text-[12px] text-danger">A temporada tem que ser um número de 1 a 99.</p>
          )}

          {carregando && (
            <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Conferindo…
            </p>
          )}

          {plano?.erro && (
            <p className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-[12.5px] text-muted-foreground">
              {plano.erro}
            </p>
          )}

          {plano && plano.conflitos.length > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/[0.08] px-3 py-2">
              <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-warning">
                <AlertTriangle className="size-3.5" />
                Lugar já ocupado
              </p>
              <ul className="scrollbar-thin mt-1 flex max-h-24 flex-col gap-0.5 overflow-y-auto text-[12px] leading-relaxed text-muted-foreground">
                {plano.conflitos.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                Nada foi mexido. Troque o número desses, ou escolha outra pasta.
              </p>
            </div>
          )}

          {plano?.pode && (
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              As pastas são movidas e renomeadas no disco, e o histórico
              acompanha. Os clipes não são tocados — é instantâneo e não ocupa
              espaço novo. Pasta de anime que ficar vazia some.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
