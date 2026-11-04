import { Star } from 'lucide-react'
import { episodeLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { HoverPreview } from '@/features/results/hover-preview'
import type { CharacterShot } from '@shared/types'

/**
 * A grade de clipes de vários episódios: a da aba Personagem e a da busca
 * por cena. Clique duplo abre, arrastar leva o arquivo pro editor, botão
 * direito mostra no Explorer, F (ou a estrela) favorita.
 */
export function ClipGrid({
  cenas,
  url,
  largura,
  onFavoritar
}: {
  cenas: CharacterShot[]
  url: (rel: string) => string | null
  largura: number
  onFavoritar: (s: CharacterShot) => void
}): JSX.Element {
  const favoritar = onFavoritar
  return (
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
  )
}
