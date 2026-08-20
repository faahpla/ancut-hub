import { ChevronRight, Loader2, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { episodeLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { HoverPreview } from '@/features/results/hover-preview'
import type { FavoriteAnime, FavoriteShot, FavoritesIndex } from '@shared/types'

/**
 * Os favoritos, em anime → personagem → clipes.
 *
 * A forma é o pedido do FAAH, literal: "Favs → Mushoku Tensei → Rudeus, e lá
 * estariam todos os clipes favoritados dele".
 *
 * O segundo nível só existe porque o favorito guarda o personagem junto com a
 * cena. Uma cena costuma ter vários personagens, então "os favoritos do
 * Rudeus" não seria dedutível depois — a informação de qual deles motivou o
 * favorito só existe no instante do clique.
 */
export function FavoritesView(): JSX.Element {
  const [dados, setDados] = useState<FavoritesIndex | null>(null)
  const [abertos, setAbertos] = useState<string[]>([])
  const [largura, setLargura] = useState(170)

  const carregar = (): void => {
    void window.ancut.results.favorites().then(setDados)
  }

  useEffect(carregar, [])

  const url = (rel: string): string | null =>
    dados?.mediaPrefix && rel ? dados.mediaPrefix + encodeURIComponent(rel) : null

  const desfavoritar = async (s: FavoriteShot): Promise<void> => {
    await window.ancut.results.favToggle(s.id, s.characterId)
    carregar()
  }

  if (!dados) {
    return (
      <div className="grid min-h-[200px] place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const total = dados.animes.reduce((n, a) => n + a.total, 0)

  if (total === 0) {
    return (
      <div className="grid min-h-[240px] place-items-center">
        <div className="flex max-w-[340px] flex-col items-center gap-2 text-center">
          <Star className="size-8 text-muted-foreground/50" />
          <p className="text-[14px] font-semibold">Nenhum favorito ainda</p>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Na aba Resultados, clique na estrela de um clipe — ou aperte{' '}
            <kbd className="rounded border border-border bg-surface-sunken px-1 font-sans text-[11px]">
              F
            </kbd>
            . Eles aparecem aqui separados por anime e personagem.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <header className="flex items-center gap-2 px-1">
        <Star className="size-4 text-warning" fill="currentColor" />
        <h1 className="text-[14px] font-semibold">Favoritos</h1>
        <span className="text-[12px] text-muted-foreground">
          {total} {total === 1 ? 'clipe' : 'clipes'} em {dados.animes.length}{' '}
          {dados.animes.length === 1 ? 'anime' : 'animes'}
        </span>
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Escala
          <input
            type="range"
            min={120}
            max={300}
            step={10}
            value={largura}
            onChange={(e) => setLargura(Number(e.target.value))}
            className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
        </label>
      </header>

      <ul className="flex flex-col gap-1.5">
        {dados.animes.map((anime) => (
          <li key={anime.anime}>
            <AnimeCard
              anime={anime}
              aberto={dados.animes.length === 1 || abertos.includes(anime.anime)}
              onAlternar={() =>
                setAbertos((a) =>
                  a.includes(anime.anime)
                    ? a.filter((x) => x !== anime.anime)
                    : [...a, anime.anime]
                )
              }
              largura={largura}
              url={url}
              onDesfavoritar={desfavoritar}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function AnimeCard({
  anime,
  aberto,
  onAlternar,
  largura,
  url,
  onDesfavoritar
}: {
  anime: FavoriteAnime
  aberto: boolean
  onAlternar: () => void
  largura: number
  url: (rel: string) => string | null
  onDesfavoritar: (s: FavoriteShot) => Promise<void>
}): JSX.Element {
  return (
    <div className="panel overflow-hidden">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
      >
        <ChevronRight
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            aberto && 'rotate-90'
          )}
        />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
          {anime.anime}
        </span>
        <span className="shrink-0 text-[11.5px] text-muted-foreground">
          {anime.characters.length}{' '}
          {anime.characters.length === 1 ? 'personagem' : 'personagens'}
        </span>
        <span className="tabular w-20 shrink-0 text-right text-[11.5px] text-muted-foreground/70">
          {anime.total} {anime.total === 1 ? 'clipe' : 'clipes'}
        </span>
      </button>

      {aberto && (
        <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
          {anime.characters.map((g) => (
            <div key={g.character} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 px-0.5">
                <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.character}
                </h3>
                <span className="text-[11px] text-muted-foreground/60">
                  {g.shots.length} {g.shots.length === 1 ? 'clipe' : 'clipes'}
                </span>
              </div>
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${largura}px, 1fr))` }}
              >
                {g.shots.map((s) => (
                  <div
                    key={`${s.id}-${s.characterId}`}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => {
                      e.preventDefault()
                      window.ancut.shell.startDrag([s.absolute], null)
                    }}
                    onDoubleClick={() => void window.ancut.shell.open(s.absolute)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      void window.ancut.shell.reveal(s.absolute)
                    }}
                    className="group relative cursor-pointer overflow-hidden rounded-md border border-border bg-surface-sunken transition-all hover:border-muted"
                  >
                    {/* A estrela aqui SEMPRE cheia e sempre visível: tudo nesta
                        tela é favorito, e o clique só serve pra tirar. */}
                    <button
                      type="button"
                      title="Tirar dos favoritos"
                      aria-label="Tirar dos favoritos"
                      onClick={(e) => {
                        e.stopPropagation()
                        void onDesfavoritar(s)
                      }}
                      className="absolute right-1.5 top-1.5 z-10 grid size-5 place-items-center rounded bg-black/50 text-warning transition-colors hover:text-danger"
                    >
                      <Star className="size-3.5" fill="currentColor" />
                    </button>

                    <div className="relative aspect-video w-full overflow-hidden bg-black/40">
                      <HoverPreview thumb={url(s.keyframe)} clip={url(s.file)} />
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1.5">
                      <span className="tabular shrink-0 text-[11px] font-medium">
                        {episodeLabel(s.season, s.episode, s.kind)}
                      </span>
                      <span className="tabular text-[11px] text-muted-foreground/70">
                        #{String(s.idx).padStart(4, '0')}
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
          ))}
        </div>
      )}
    </div>
  )
}
