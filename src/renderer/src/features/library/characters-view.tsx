import {
  ArrowLeft,
  ChevronRight,
  Clapperboard,
  FolderOpen,
  Loader2,
  Search,
  Star,
  Users,
  X
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { episodeLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { HoverPreview } from '@/features/results/hover-preview'
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
  const [expandidos, setExpandidos] = useState<string[]>([])

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
  const expandido = (anime: string): boolean =>
    buscando || secoes.length === 1 || expandidos.includes(anime)

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
            <div
              className="grid gap-2.5"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${largura}px, 1fr))` }}
            >
              {cenas.map((s) => (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  draggable
                  // Mesmo gesto da grade de cenas: cancelar o arrasto do HTML
                  // é o que deixa o do Windows entrar carregando o arquivo.
                  onDragStart={(e) => {
                    e.preventDefault()
                    window.ancut.shell.startDrag([s.absolute], null)
                  }}
                  onDoubleClick={() => void window.ancut.shell.open(s.absolute)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    void window.ancut.shell.reveal(s.absolute)
                  }}
                  onKeyDown={(e) => {
                    // Mesma tecla da grade de cenas. Um atalho que só vale
                    // numa tela seria mais uma exceção pra decorar.
                    if (e.key === 'f' || e.key === 'F') {
                      e.preventDefault()
                      favoritar(s)
                    }
                  }}
                  className="group relative cursor-pointer overflow-hidden rounded-md border border-border bg-surface-sunken text-left transition-all hover:border-muted"
                >
                  {/* Sempre visível quando ligada, só no hover quando
                      desligada: favorito é informação, e informação que some
                      não informa. Igual à grade de cenas. */}
                  <button
                    type="button"
                    aria-label={s.favorite ? 'Tirar dos favoritos' : 'Favoritar'}
                    title={s.favorite ? 'Tirar dos favoritos' : 'Favoritar (F)'}
                    onClick={(e) => {
                      e.stopPropagation()
                      favoritar(s)
                    }}
                    className={cn(
                      'absolute right-1.5 top-1.5 z-10 grid size-5 place-items-center rounded transition-all',
                      s.favorite
                        ? 'bg-black/50 text-warning'
                        : 'bg-black/50 text-white/70 opacity-0 hover:text-warning group-hover:opacity-100'
                    )}
                  >
                    <Star className="size-3.5" fill={s.favorite ? 'currentColor' : 'none'} />
                  </button>

                  <div className="relative aspect-video w-full overflow-hidden bg-black/40">
                    <HoverPreview thumb={url(s.keyframe)} clip={url(s.file)} />
                    {s.confidence !== null && (
                      <span
                        className={cn(
                          'tabular absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                          s.confidence >= 0.9
                            ? 'bg-primary/85 text-primary-foreground'
                            : s.confidence >= 0.8
                              ? 'bg-surface/90 text-foreground'
                              : 'bg-warning/85 text-warning-foreground'
                        )}
                      >
                        {s.confidence.toFixed(2)}
                      </span>
                    )}
                  </div>
                  {/* De qual episódio veio: numa grade que mistura o acervo
                      inteiro, cena sem procedência não serve pra nada. */}
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <span className="truncate text-[11px] text-muted-foreground">{s.anime}</span>
                    <span className="tabular shrink-0 text-[11px] font-medium">
                      {episodeLabel(s.season, s.episode, s.kind)}
                    </span>
                    <span className="flex-1" />
                    <span className="tabular shrink-0 text-[11px] text-muted-foreground/70">
                      {s.duration.toFixed(1)}s
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <header className="flex items-center gap-2 px-1">
        <Users className="size-4 text-muted-foreground" />
        <h1 className="text-[14px] font-semibold">Personagens</h1>
        <span className="text-[12px] text-muted-foreground">{lista.length} no acervo</span>
        <span className="flex-1" />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar personagem…"
            className="h-8 w-52 rounded-md border border-border bg-surface-sunken pl-8 pr-7 text-[12.5px] outline-none placeholder:text-muted-foreground/70 focus:border-primary/60"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </header>

      {visiveis.length === 0 ? (
        <p className="px-1 py-6 text-center text-[12.5px] text-muted-foreground">
          {busca ? `Ninguém com “${busca}”.` : 'Nenhum personagem identificado ainda.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {secoes.map((sec) => (
            <li key={sec.anime} className="panel overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setExpandidos((a) =>
                    a.includes(sec.anime) ? a.filter((x) => x !== sec.anime) : [...a, sec.anime]
                  )
                }
                aria-expanded={expandido(sec.anime)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
              >
                <ChevronRight
                  className={cn(
                    'size-4 shrink-0 text-muted-foreground transition-transform',
                    expandido(sec.anime) && 'rotate-90'
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                  {sec.anime}
                </span>
                <span className="shrink-0 text-[11.5px] text-muted-foreground">
                  {sec.gente.length} {sec.gente.length === 1 ? 'personagem' : 'personagens'}
                </span>
                <span className="tabular w-24 shrink-0 text-right text-[11.5px] text-muted-foreground/70">
                  {sec.cenas.toLocaleString('pt-BR')} cenas
                </span>
              </button>

              {expandido(sec.anime) && (
                <ul className="flex flex-col gap-1 border-t border-border p-2">
                  {sec.gente.map((c) => (
                    <li key={c.name}>
                      <button
                        type="button"
                        onClick={() => abrir(c, sec.anime)}
                        className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-surface-hover"
                      >
                        <div className="h-11 w-[74px] shrink-0 overflow-hidden rounded bg-black/40">
                          {url(c.sample) ? (
                            <img
                              src={url(c.sample) as string}
                              alt=""
                              loading="lazy"
                              draggable={false}
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="grid size-full place-items-center">
                              <Clapperboard className="size-4 text-muted-foreground/50" />
                            </div>
                          )}
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold">
                            {c.name}
                          </span>
                          {/* O anime saiu daqui: ele é o título da seção. Sobra o que
                      a seção NÃO diz — as outras grafias, e o aviso de que
                      ele também aparece em outro anime. */}
                          {(c.aliases.length > 0 || c.animes.length > 1) && (
                            <span className="block truncate text-[11px] text-muted-foreground/80">
                              {c.aliases.length > 0 && `também: ${c.aliases.join(', ')}`}
                              {c.aliases.length > 0 && c.animes.length > 1 && ' · '}
                              {c.animes.length > 1 &&
                                `em mais ${c.animes.length - 1} ${
                                  c.animes.length - 1 === 1 ? 'anime' : 'animes'
                                }`}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-right text-[11.5px] text-muted-foreground">
                          <span className="tabular block font-medium text-foreground">
                            {naSecao(c, sec.anime).shots.toLocaleString('pt-BR')} cenas
                          </span>
                          {naSecao(c, sec.anime).episodes}{' '}
                          {naSecao(c, sec.anime).episodes === 1 ? 'episódio' : 'episódios'}
                        </span>
                        <FolderOpen className="size-4 shrink-0 text-muted-foreground/40" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
