import { Loader2, ScanSearch, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useResultsStore } from '@/stores/results-store'
import type { CharacterShot, SceneShot } from '@shared/types'
import { ClipGrid } from './clip-grid'
import { agruparPorAnime } from './group-episodes'

/**
 * Procurar cena pelo que acontece nela: "luta na chuva", "pôr do sol",
 * "Lucy chorando". Ideia do "Gerar recap" do Dangai, que escolhe as cenas
 * do vídeo pela descrição do roteiro.
 *
 * Quem entende a descrição é o mesmo CLIP do reconhecimento, olhando o
 * quadro INTEIRO da cena (lá ele olha só o rosto). Ele só lê inglês: o motor
 * traduz as palavras de cena mais comuns, e o que vier em inglês passa direto.
 * Nome de personagem vira filtro — "Lucy chorando" é "cenas da Lucy que
 * parecem choro".
 *
 * "Mais bonitas" ordena pela nota de beleza (LAION aesthetic) com a
 * nitidez de desempate: quadro borrado no meio do movimento perde ponto.
 * Sem descrição, são as mais bonitas do anime inteiro.
 */
export function ScenesView(): JSX.Element {
  const recent = useResultsStore((s) => s.recent)
  const loadRecent = useResultsStore((s) => s.loadRecent)
  useEffect(() => {
    if (recent.length === 0) void loadRecent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const animes = useMemo(() => agruparPorAnime(recent), [recent])
  const [consulta, setConsulta] = useState('')
  const [animePasta, setAnimePasta] = useState('')
  const [ordem, setOrdem] = useState<'relevancia' | 'beleza'>('relevancia')
  const [cenas, setCenas] = useState<SceneShot[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null)
  const [entendido, setEntendido] = useState<{
    consultaEn: string
    personagens: string[]
    total: number
  } | null>(null)
  const [falha, setFalha] = useState('')
  const [prefixo, setPrefixo] = useState('')
  const [largura, setLargura] = useState(200)

  useEffect(
    () =>
      window.ancut.results.onScenesEvent((ev) => {
        if (ev.type === 'cenas-progresso') setProgresso({ feitos: ev.feitos, total: ev.total })
      }),
    []
  )

  const episodios = (): number[] => {
    const alvo = animePasta ? animes.filter((a) => a.pasta === animePasta) : animes
    return alvo.flatMap((a) => a.temporadas.flatMap((t) => t.episodios.map((e) => e.episodeId)))
  }

  const procurar = async (qualOrdem = ordem): Promise<void> => {
    if (buscando) return
    const ids = episodios()
    if (ids.length === 0) return
    setBuscando(true)
    setFalha('')
    setProgresso(null)
    try {
      const r = await window.ancut.results.searchScenes({
        consulta: consulta.trim(),
        episodios: ids,
        ordem: qualOrdem,
        limite: 400
      })
      if (!r) {
        setFalha('A busca não terminou — tente de novo.')
        return
      }
      setPrefixo(r.mediaPrefix ?? '')
      setCenas(r.shots)
      setEntendido({ consultaEn: r.consultaEn, personagens: r.personagens, total: r.total })
    } finally {
      setBuscando(false)
      setProgresso(null)
    }
  }

  const trocarOrdem = (o: 'relevancia' | 'beleza'): void => {
    setOrdem(o)
    if (cenas) void procurar(o)
  }

  const url = (rel: string): string | null =>
    prefixo && rel ? prefixo + encodeURIComponent(rel) : null

  const favoritar = (s: CharacterShot): void => {
    setCenas((atual) =>
      (atual ?? []).map((c) => (c.id === s.id ? { ...c, favorite: !c.favorite } : c))
    )
    void window.ancut.results.favToggle(s.id, 0).then((r) => {
      if (!r) return
      setCenas((atual) =>
        (atual ?? []).map((c) => (c.id === s.id ? { ...c, favorite: r.favorite } : c))
      )
    })
  }

  const semDescricao = consulta.trim() === ''

  return (
    <div className="animate-rise-in mx-auto flex w-full max-w-[1500px] flex-col gap-4">
      <header className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[260px] flex-1 flex-col gap-1">
          <h1 className="flex items-center gap-2.5 text-[26px] font-bold tracking-tight">
            <ScanSearch className="size-6 text-primary" />
            Procurar cena
          </h1>
          <p className="text-[14px] text-muted-foreground">
            Descreva o que acontece na cena. Nome de personagem vira filtro.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
          Escala
          <input
            type="range"
            min={130}
            max={340}
            step={10}
            value={largura}
            onChange={(e) => setLargura(Number(e.target.value))}
            className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
        </label>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-1">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void procurar()}
            placeholder="Descreva a cena: luta na chuva, Lucy chorando, pôr do sol na praia…"
            className="h-9 w-full rounded-md border border-border bg-surface-sunken pl-8 pr-7 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:border-primary/60"
          />
          {consulta && (
            <button
              type="button"
              onClick={() => setConsulta('')}
              aria-label="Limpar"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <select
          value={animePasta}
          onChange={(e) => setAnimePasta(e.target.value)}
          className="h-9 max-w-[240px] rounded-md border border-border bg-surface-sunken px-2 text-[12.5px] outline-none focus:border-primary/60"
          title="Onde procurar"
        >
          <option value="">Todos os animes</option>
          {animes.map((a) => (
            <option key={a.pasta} value={a.pasta}>
              {a.nome}
            </option>
          ))}
        </select>
        <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-surface-sunken p-0.5">
          {(
            [
              ['relevancia', 'Mais parecidas', Search],
              ['beleza', 'Mais bonitas', Sparkles]
            ] as const
          ).map(([o, rotulo, Icone]) => (
            <button
              key={o}
              type="button"
              onClick={() => trocarOrdem(o)}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1 text-[12px] transition-colors',
                ordem === o
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icone className="size-3.5" />
              {rotulo}
            </button>
          ))}
        </div>
        <Button size="sm" variant="primary" disabled={buscando} onClick={() => void procurar()}>
          {buscando ? <Loader2 className="animate-spin" /> : <Search />}
          {semDescricao ? 'Mostrar as mais bonitas' : 'Procurar'}
        </Button>
      </div>

      {buscando && (
        <p className="flex items-center gap-2 px-1 text-[12px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {progresso && progresso.total > 0 && progresso.feitos < progresso.total
            ? `Preparando a busca nos episódios que ainda não têm: ${progresso.feitos + 1} de ${progresso.total} (só na primeira vez)…`
            : 'Procurando…'}
        </p>
      )}

      {falha && (
        <p className="rounded-md border border-danger/40 bg-danger/[0.08] px-3 py-2 text-[12.5px] text-danger">
          {falha}
        </p>
      )}

      {!buscando && entendido && (
        <p className="px-1 text-[12px] text-muted-foreground">
          {entendido.consultaEn
            ? <>Entendi: <span className="font-medium text-foreground">{entendido.consultaEn}</span></>
            : 'As mais bonitas'}
          {entendido.personagens.length > 0 && (
            <> · só cenas de <span className="font-medium text-foreground">{entendido.personagens.join(' e ')}</span></>
          )}
          {' · '}
          {cenas?.length ?? 0} de {entendido.total.toLocaleString('pt-BR')} cenas
        </p>
      )}

      {cenas === null ? (
        <p className="px-1 py-10 text-center text-[12.5px] leading-relaxed text-muted-foreground">
          Escreva o que acontece na cena e aperte Enter. Dá pra misturar personagem
          (“Lucy chorando”) e escrever em inglês também.
          <br />
          Sem descrição, “Mais bonitas” mostra as cenas mais bonitas do anime.
        </p>
      ) : cenas.length === 0 ? (
        <p className="px-1 py-10 text-center text-[12.5px] text-muted-foreground">
          Nenhuma cena. Se citou um personagem, confira se ele tem cenas marcadas neste anime.
        </p>
      ) : (
        <ClipGrid cenas={cenas} url={url} largura={largura} onFavoritar={favoritar} />
      )}
    </div>
  )
}
