import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  Search,
  Users,
  X
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Rosto } from './capa'
import { ClipGrid } from './clip-grid'
import type { CharacterEntry, CharacterShot } from '@shared/types'

/**
 * O acervo visto por PERSONAGEM, e não por anime.
 *
 * A Biblioteca organiza como o material entra: anime → temporada → episódio.
 * Mas o pedido é outro — "me dá tudo que eu já tenho do Rimuru" — e isso
 * atravessa episódios, temporadas e até títulos diferentes.
 *
 * As grafias já chegam unificadas do motor. No acervo dele o Rimuru existia
 * escrito de quatro jeitos, somando 573 cenas em 11 episódios; procurar por
 * ele antes disso daria duas listas incompletas.
 */
export function CharactersView(): JSX.Element {
  const [lista, setLista] = useState<CharacterEntry[] | null>(null)
  const [prefixo, setPrefixo] = useState('')
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<CharacterEntry | null>(null)
  /** De qual anime a lista aberta veio. O mesmo personagem pode estar em dois
   *  (o Ichigo está), e a grade mostra só o da seção que foi clicada. */
  const [animeAberto, setAnimeAberto] = useState<string>('')
  const [cenas, setCenas] = useState<CharacterShot[] | null>(null)
  const [largura, setLargura] = useState(180)
  /** Seções fechadas à mão. Abertas por padrão: com rosto, a grade se lê de relance. */
  const [recolhidos, setRecolhidos] = useState<string[]>([])

  useEffect(() => {
    let vivo = true
    void window.ancut.results.characters().then((r) => {
      if (!vivo || !r) return
      setLista(r.characters)
      setPrefixo(r.mediaPrefix)
    })
    return () => {
      vivo = false
    }
  }, [])

  // Filtro local: a lista inteira já está aqui (116 personagens no acervo
  // dele) e ir ao motor a cada tecla só somaria espera. O nome do anime também
  // filtra — "bleach" tem que trazer a seção do Bleach inteira.
  const visiveis = useMemo(() => {
    const alvo = busca.trim().toLowerCase()
    if (!alvo || !lista) return lista ?? []
    return lista.filter(
      (c) =>
        c.name.toLowerCase().includes(alvo) ||
        c.aliases.some((a) => a.toLowerCase().includes(alvo)) ||
        c.animes.some((a) => a.toLowerCase().includes(alvo))
    )
  }, [lista, busca])

  /**
   * Uma seção por anime.
   *
   * 116 personagens numa lista só misturam Mushoku, Tensura, Re:Zero e dois
   * Bleach — e procurar vira rolagem. Aqui cada anime é uma gaveta.
   *
   * Quem aparece em dois animes entra nos dois, com a contagem DAQUELE anime:
   * o Ichigo tem 162 cenas numa pasta de Bleach e 49 na outra, e repetir 211
   * nas duas seria errado nas duas.
   */
  const secoes = useMemo(() => {
    const caixas = new Map<string, { anime: string; cenas: number; gente: CharacterEntry[] }>()
    for (const c of visiveis) {
      // `byAnime` é o número certo; `animes` é o que existia antes e vira
      // reserva quando o motor ainda não atualizou.
      const partes = c.byAnime?.length
        ? c.byAnime
        : c.animes.map((a) => ({
            anime: a,
            shots: c.shots,
            episodes: c.episodes
          }))
      for (const p of partes) {
        const caixa = caixas.get(p.anime) ?? {
          anime: p.anime,
          cenas: 0,
          gente: []
        }
        caixa.cenas += p.shots
        caixa.gente.push(c)
        caixas.set(p.anime, caixa)
      }
    }
    return [...caixas.values()].sort((a, b) => b.cenas - a.cenas || a.anime.localeCompare(b.anime))
  }, [visiveis])

  // Buscando, tudo que sobrou está aberto: filtrar pra depois ter que clicar
  // em cada resultado não é uma busca, é uma segunda busca. Mesma regra da
  // aba Anime.
  const buscando = busca.trim() !== ''
  const recolhido = (anime: string): boolean => !buscando && recolhidos.includes(anime)

  /** Quanto ele tem NESTE anime — o número que a seção mostra. */
  const naSecao = (c: CharacterEntry, anime: string): { shots: number; episodes: number } =>
    c.byAnime?.find((x) => x.anime === anime) ?? {
      shots: c.shots,
      episodes: c.episodes
    }

  const abrir = (c: CharacterEntry, anime: string): void => {
    setAberto(c)
    setAnimeAberto(anime)
    setCenas(null)
    void window.ancut.results.characterShots(c.ids).then((todas) =>
      // A grade fica no anime da seção clicada. Abrir o Ichigo pelo "Thousand
      // Year Blood War" e receber as cenas da outra pasta junto desfaria a
      // separação que a lista acabou de fazer.
      setCenas((todas ?? []).filter((s) => !anime || s.anime === anime))
    )
  }

  const url = (rel: string): string | null =>
    prefixo && rel ? prefixo + encodeURIComponent(rel) : null

  /**
   * Favoritar daqui, sem passar pelo episódio.
   *
   * A chave é 0 — "favoritei a cena", não "favoritei a cena por causa deste
   * personagem". Dá no mesmo pra esta pasta: os Favoritos deduzem o
   * personagem de quem o reconhecimento achou na cena, e ela só está aqui
   * porque ele foi achado nela.
   *
   * A tela vira NA HORA e não recarrega: são 724 cenas do Rudeus, e uma volta
   * ao motor a cada estrela seria um piscar de lista a cada clique.
   */
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

  if (!lista) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (aberto) {
    return (
      <div className="animate-fade-in flex flex-col gap-2.5">
        <header className="flex items-center gap-3">
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setAberto(null)}>
            <ArrowLeft />
            Personagens
          </Button>
          <h1 className="truncate text-[15px] font-bold">{aberto.name}</h1>
          {animeAberto && (
            <span className="shrink-0 rounded border border-border bg-surface-sunken px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {animeAberto}
            </span>
          )}
          <span className="shrink-0 text-[12px] text-muted-foreground">
            {cenas ? cenas.length : naSecao(aberto, animeAberto).shots} cenas ·{' '}
            {naSecao(aberto, animeAberto).episodes}{' '}
            {naSecao(aberto, animeAberto).episodes === 1 ? 'episódio' : 'episódios'}
          </span>
          {aberto.aliases.length > 0 && (
            <span
              className="truncate text-[11.5px] text-muted-foreground/70"
              title={aberto.aliases.join('\n')}
            >
              também: {aberto.aliases.join(', ')}
            </span>
          )}
          <span className="flex-1" />
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

        {!cenas ? (
          <div className="grid min-h-[200px] place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div>
            <ClipGrid cenas={cenas} url={url} largura={largura} onFavoritar={favoritar} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="animate-rise-in mx-auto flex w-full max-w-[1500px] flex-col gap-6">
      <header className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[260px] flex-1 flex-col gap-1">
          <h1 className="flex items-center gap-2.5 text-[26px] font-bold tracking-tight">
            <Users className="size-6 text-primary" />
            Personagens
          </h1>
          <p className="text-[14px] text-muted-foreground">
            {lista.length} no acervo · clique pra ver todas as cenas de um personagem, de todos os episódios
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar personagem ou anime…"
            className="h-10 w-72 rounded-lg border border-border bg-surface-sunken/80 pl-9 pr-8 text-[13.5px] outline-none placeholder:text-muted-foreground/70 focus:border-primary/60"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </header>

      {visiveis.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted-foreground">
          {busca ? `Ninguém com “${busca}”.` : 'Nenhum personagem identificado ainda.'}
        </p>
      ) : (
        secoes.map((sec) => (
          <section key={sec.anime} className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() =>
                setRecolhidos((a) =>
                  a.includes(sec.anime) ? a.filter((x) => x !== sec.anime) : [...a, sec.anime]
                )
              }
              aria-expanded={!recolhido(sec.anime)}
              className="flex items-center gap-3 text-left"
            >
              <ChevronRight
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform',
                  !recolhido(sec.anime) && 'rotate-90'
                )}
              />
              <span className="truncate text-[16px] font-semibold">{sec.anime}</span>
              <span className="shrink-0 text-[12.5px] text-muted-foreground">
                {sec.gente.length} {sec.gente.length === 1 ? 'personagem' : 'personagens'} ·{' '}
                {sec.cenas.toLocaleString('pt-BR')} cenas
              </span>
            </button>
            {!recolhido(sec.anime) && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                {sec.gente.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => abrir(c, sec.anime)}
                    title={c.aliases.length > 0 ? `também: ${c.aliases.join(', ')}` : c.name}
                    className="group flex flex-col items-center gap-2 rounded-xl border border-border/70 bg-surface/80 px-3 pb-3.5 pt-4 text-center transition-all hover:-translate-y-0.5 hover:border-primary/40"
                  >
                    <Rosto url={c.avatarUrl} nome={c.name} tamanho={76} />
                    <span className="w-full truncate text-[13.5px] font-semibold">{c.name}</span>
                    <span className="text-[11.5px] text-muted-foreground">
                      {naSecao(c, sec.anime).shots.toLocaleString('pt-BR')} cenas ·{' '}
                      {naSecao(c, sec.anime).episodes}{' '}
                      {naSecao(c, sec.anime).episodes === 1 ? 'ep.' : 'eps.'}
                    </span>
                    {c.animes.length > 1 && (
                      <span className="text-[11px] text-muted-foreground/70">
                        em mais {c.animes.length - 1} {c.animes.length - 1 === 1 ? 'anime' : 'animes'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  )
}
