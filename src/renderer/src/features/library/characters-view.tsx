import { ArrowLeft, Clapperboard, FolderOpen, Loader2, Search, Users, X } from 'lucide-react'
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
  const [cenas, setCenas] = useState<CharacterShot[] | null>(null)
  const [largura, setLargura] = useState(180)

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

  // Filtro local: a lista inteira já está aqui (97 personagens no acervo dele)
  // e ir ao motor a cada tecla só somaria espera.
  const visiveis = useMemo(() => {
    const alvo = busca.trim().toLowerCase()
    if (!alvo || !lista) return lista ?? []
    return lista.filter(
      (c) =>
        c.name.toLowerCase().includes(alvo) ||
        c.aliases.some((a) => a.toLowerCase().includes(alvo))
    )
  }, [lista, busca])

  const abrir = (c: CharacterEntry): void => {
    setAberto(c)
    setCenas(null)
    void window.ancut.results.characterShots(c.ids).then(setCenas)
  }

  const url = (rel: string): string | null =>
    prefixo && rel ? prefixo + encodeURIComponent(rel) : null

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
          <span className="shrink-0 text-[12px] text-muted-foreground">
            {aberto.shots} cenas · {aberto.episodes}{' '}
            {aberto.episodes === 1 ? 'episódio' : 'episódios'}
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
                  className="group relative cursor-pointer overflow-hidden rounded-md border border-border bg-surface-sunken text-left transition-all hover:border-muted"
                >
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
          {visiveis.map((c) => (
            <li key={c.name}>
              <button
                type="button"
                onClick={() => abrir(c)}
                className="panel flex w-full items-center gap-3 p-2 text-left transition-colors hover:bg-surface-hover"
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
                  <span className="block truncate text-[13.5px] font-semibold">{c.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground/80">
                    {c.animes.join(', ')}
                    {c.aliases.length > 0 && ` · também: ${c.aliases.join(', ')}`}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11.5px] text-muted-foreground">
                  <span className="tabular block font-medium text-foreground">
                    {c.shots.toLocaleString('pt-BR')} cenas
                  </span>
                  {c.episodes} {c.episodes === 1 ? 'episódio' : 'episódios'}
                </span>
                <FolderOpen className="size-4 shrink-0 text-muted-foreground/40" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
