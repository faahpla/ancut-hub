import { Check, Combine, FolderOpen, Loader2, PlayCircle, SquareCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ContextMenu } from '@/components/ui/context-menu'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { diskPath, mediaUrl, useResultsStore } from '@/stores/results-store'
import { cn } from '@/lib/utils'
import type { ShotRow } from '@shared/types'

/**
 * Grade de cenas. O controle de escala é uma variável CSS na grade —
 * `repeat(auto-fill, minmax(<largura>, 1fr))` reflui sozinho e o número de
 * colunas sai da largura disponível, sem cálculo manual.
 */
export function ShotGrid(): JSX.Element {
  const {
    shots,
    loadingShots,
    results,
    selectedCharacter,
    mediaPrefix,
    activeShot,
    setActiveShot,
    cardWidth,
    setCardWidth,
    selection,
    toggleSelected,
    clearSelection,
    mergeSelected,
    deleteSelected,
    lastTrashDir,
    merging
  } = useResultsStore()
  const [confirmar, setConfirmar] = useState<'mesclar' | 'excluir' | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; shot: ShotRow } | null>(null)

  const raiz = results?.episodeRoot ?? ''

  /**
   * Arrasta o clipe pra fora do app.
   *
   * Se a cena estiver marcada, vão TODAS as marcadas — arrastar uma de um
   * grupo que você acabou de selecionar quase nunca é o que se quer, e a
   * seleção já é o gesto de "estas aqui" no resto da tela.
   */
  const arrastar = (shot: ShotRow): void => {
    const alvos =
      selection.includes(shot.id) && selection.length > 1
        ? shots.filter((s) => selection.includes(s.id))
        : [shot]
    const arquivos = alvos
      .map((s) => diskPath(raiz, s.file))
      .filter((p): p is string => p !== null)
    if (arquivos.length === 0) return
    window.ancut.shell.startDrag(arquivos, diskPath(raiz, shot.keyframe))
  }

  return (
    <div className="panel flex min-h-0 flex-col overflow-hidden">
      <header className="flex items-center gap-3 px-3.5 pb-2 pt-3">
        <h2 className="truncate text-[13px] font-semibold">
          {selectedCharacter ? selectedCharacter.name : 'Cenas'}
          {selectedCharacter && (
            <span className="ml-2 font-normal text-muted-foreground">
              {shots.length} cenas
            </span>
          )}
        </h2>
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Escala
          <input
            type="range"
            min={130}
            max={340}
            step={10}
            value={cardWidth}
            onChange={(e) => setCardWidth(Number(e.target.value))}
            className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
        </label>
      </header>

      {selection.length > 0 && (
        <div className="mx-3 mb-2 flex shrink-0 items-center gap-2 rounded-md border border-primary/30 bg-primary/[0.08] px-3 py-2">
          <span className="text-[12.5px] font-semibold text-primary">
            {selection.length} {selection.length === 1 ? 'cena marcada' : 'cenas marcadas'}
          </span>
          <span className="text-[11.5px] text-muted-foreground">
            {selection.length < 2
              ? 'marque mais uma pra poder mesclar'
              : 'mesclar junta tudo num clipe só, em ordem cronológica'}
          </span>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={clearSelection} disabled={merging}>
            Limpar
          </Button>
          <Button
            size="sm"
            variant="danger"
            className="gap-1.5"
            disabled={merging}
            onClick={() => setConfirmar('excluir')}
          >
            <Trash2 />
            Excluir
          </Button>
          <Button
            size="sm"
            variant="primary"
            className="gap-1.5"
            disabled={selection.length < 2 || merging}
            onClick={() => setConfirmar('mesclar')}
          >
            {merging ? <Loader2 className="animate-spin" /> : <Combine />}
            Mesclar
          </Button>
        </div>
      )}

      <Dialog open={confirmar !== null} onOpenChange={() => setConfirmar(null)}>
        {confirmar === 'mesclar' && (
          <DialogContent
            title={`Mesclar ${selection.length} cenas num clipe só?`}
            description="Os pedaços saem da pasta shots e o clipe mesclado toma o lugar deles."
            onClose={() => setConfirmar(null)}
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmar(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setConfirmar(null)
                    void mergeSelected()
                  }}
                >
                  Mesclar
                </Button>
              </>
            }
          >
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              As pastas dos personagens não são tocadas — os pedaços continuam
              lá, então nada se perde de verdade.
            </p>
          </DialogContent>
        )}

        {confirmar === 'excluir' && (
          <DialogContent
            title={
              selection.length === 1
                ? 'Excluir esta cena?'
                : `Excluir ${selection.length} cenas?`
            }
            description="O clipe sai das pastas e vai pra lixeira do episódio."
            onClose={() => setConfirmar(null)}
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmar(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirmar(null)
                    void deleteSelected()
                  }}
                >
                  Mandar pra lixeira
                </Button>
              </>
            }
          >
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              Some da pasta shots, das pastas dos personagens e das duplas,
              junto com o keyframe. O arquivo em si não é destruído: vai pra
              uma pasta <span className="font-medium">_lixeira</span> datada,
              dentro do episódio — dá pra arrastar de volta pelo Explorer se
              você mudar de ideia.
            </p>
          </DialogContent>
        )}
      </Dialog>

      {lastTrashDir && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-border bg-surface-hover/50 px-3 py-1.5">
          <Trash2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-[12px] text-muted-foreground">
            As cenas excluídas foram pra lixeira do episódio.
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void window.ancut.shell.reveal(lastTrashDir)}
          >
            Abrir lixeira
          </Button>
        </div>
      )}

      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-3">
        {loadingShots ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : shots.length === 0 ? (
          <div className="grid h-full place-items-center text-[13px] text-muted-foreground">
            Nenhuma cena para este personagem.
          </div>
        ) : (
          <div
            className="grid gap-2.5"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`
            }}
          >
            {shots.map((shot) => (
              <ShotCard
                key={shot.id}
                shot={shot}
                prefix={mediaPrefix}
                active={activeShot?.id === shot.id}
                marcada={selection.includes(shot.id)}
                onSelect={() => setActiveShot(shot)}
                onToggle={(faixa) => toggleSelected(shot.id, faixa)}
                onDrag={() => arrastar(shot)}
                onMenu={(x, y) => setMenu({ x, y, shot })}
              />
            ))}
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'Ir para a pasta',
              icon: FolderOpen,
              onSelect: () => {
                const p = diskPath(raiz, menu.shot.file)
                if (p) void window.ancut.shell.reveal(p)
              }
            },
            {
              label: 'Abrir no player',
              icon: PlayCircle,
              onSelect: () => {
                const p = diskPath(raiz, menu.shot.file)
                if (p) void window.ancut.shell.open(p)
              }
            },
            {
              label: selection.includes(menu.shot.id) ? 'Desmarcar' : 'Marcar',
              icon: SquareCheck,
              onSelect: () => toggleSelected(menu.shot.id)
            }
          ]}
        />
      )}
    </div>
  )
}

function ShotCard({
  shot,
  prefix,
  active,
  marcada,
  onSelect,
  onToggle,
  onDrag,
  onMenu
}: {
  shot: ShotRow
  prefix: string
  active: boolean
  marcada: boolean
  onSelect: () => void
  /** `faixa` = shift pressionado: marca do último marcado até aqui. */
  onToggle: (faixa: boolean) => void
  onDrag: () => void
  onMenu: (x: number, y: number) => void
}): JSX.Element {
  const thumb = mediaUrl(prefix, shot.keyframe)
  const conf = shot.confidence

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      draggable
      // O `preventDefault` é o ponto: mata o arrasto do HTML (que só carregaria
      // texto) pra o do Windows entrar no lugar, carregando o arquivo de
      // verdade. Sem ele os dois disputam o mesmo gesto e nada sai do app.
      onDragStart={(e) => {
        e.preventDefault()
        onDrag()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(e.clientX, e.clientY)
      }}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-md border bg-surface-sunken text-left transition-all',
        marcada
          ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.5)]'
          : active
            ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.4)]'
            : 'border-border hover:border-muted'
      )}
    >
      {/* A caixa fica FORA do fluxo de clique do card: clicar na imagem toca a
          cena, clicar aqui marca pra mesclar. Misturar os dois faria toda
          tentativa de assistir virar seleção. */}
      <button
        type="button"
        aria-label={marcada ? 'Desmarcar cena' : 'Marcar cena pra mesclar'}
        onClick={(e) => {
          e.stopPropagation()
          onToggle(e.shiftKey)
        }}
        className={cn(
          'absolute left-1.5 top-1.5 z-10 grid size-5 place-items-center rounded border transition-all',
          marcada
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-white/40 bg-black/50 opacity-0 group-hover:opacity-100'
        )}
      >
        {marcada && <Check className="size-3.5" strokeWidth={3} />}
      </button>

      <div className="relative aspect-video w-full overflow-hidden bg-black/40">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            draggable={false}
            className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid size-full place-items-center text-[11px] text-muted-foreground">
            sem keyframe
          </div>
        )}
        {/* Sem selo na visão de todas as cenas: confiança pertence ao par
            (cena, personagem), e ali a cena pode ter vários ou nenhum. */}
        {conf !== null && (
          <span
            className={cn(
              'tabular absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
              conf >= 0.9
                ? 'bg-primary/85 text-primary-foreground'
                : conf >= 0.8
                  ? 'bg-surface/90 text-foreground'
                  : 'bg-warning/85 text-warning-foreground'
            )}
          >
            {conf.toFixed(2)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="tabular text-[11px] text-muted-foreground">
          #{String(shot.idx).padStart(4, '0')}
        </span>
        <span className="tabular text-[11px] text-muted-foreground/70">
          {shot.duration.toFixed(1)}s
        </span>
      </div>
    </div>
  )
}
