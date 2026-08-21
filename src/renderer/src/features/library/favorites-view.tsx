import {
  ChevronRight,
  FolderOpen,
  GripVertical,
  Loader2,
  PlayCircle,
  Star,
  Tag,
  UserMinus,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ContextMenu } from '@/components/ui/context-menu'
import { episodeLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { HoverPreview } from '@/features/results/hover-preview'
import { TagCharacterDialog } from './tag-character-dialog'
import type {
  CharacterEntry,
  FavoriteAnime,
  FavoriteShot,
  FavoritesIndex
} from '@shared/types'

/** O balaio do backend (`storage/favoritos.py`), pra a tela poder explicá-lo. */
const SEM_PERSONAGEM = 'Sem personagem'

/** O que o arrasto de dentro do app carrega. Não é o arquivo — é a cena. */
const TIPO_ARRASTO = 'application/x-ancut-shot'

/**
 * Os favoritos, em anime → personagem → clipes.
 *
 * A forma é o pedido do FAAH, literal: "Favs → Mushoku Tensei → Rudeus, e lá
 * estariam todos os clipes favoritados dele".
 *
 * O segundo nível vem de quem o reconhecimento achou na cena. Quando ele não
 * achou ninguém, o clipe cai em "Sem personagem" — e é daí que nasce a
 * correção manual desta tela: arrastar pelo punho até o personagem certo, ou
 * clicar com o direito e escolher. Ver `storage/marcar.py`.
 */
export function FavoritesView(): JSX.Element {
  const [dados, setDados] = useState<FavoritesIndex | null>(null)
  const [elenco, setElenco] = useState<CharacterEntry[] | null>(null)
  const [abertos, setAbertos] = useState<string[]>([])
  const [largura, setLargura] = useState(170)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    shot: FavoriteShot
    anime: string
    grupo: string
    /** Id do personagem DESTE grupo — não confundir com a chave do favorito,
     *  que é 0 quando o agrupamento foi deduzido. */
    grupoId: number | null
  } | null>(null)
  const [marcando, setMarcando] = useState<{ shot: FavoriteShot; anime: string; grupo: string } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = (): void => {
    void window.ancut.results.favorites().then(setDados)
  }

  useEffect(carregar, [])

  // O elenco vem uma vez e serve pro diálogo de todos os cards. É a mesma
  // lista da aba Personagem, com as grafias já unidas.
  useEffect(() => {
    void window.ancut.results.characters().then((r) => setElenco(r?.characters ?? []))
  }, [])

  const url = (rel: string): string | null =>
    dados?.mediaPrefix && rel ? dados.mediaPrefix + encodeURIComponent(rel) : null

  const desfavoritar = async (s: FavoriteShot): Promise<void> => {
    // Um clique só: desfavoritar apaga a cena dos favoritos inteira, não a
    // linha de um personagem. Ver `db.toggle_favorite`.
    await window.ancut.results.favToggle(s.id, s.characterId)
    carregar()
  }

  /** Marca (ou desmarca) o personagem e recarrega a árvore. */
  const marcar = async (shotId: number, characterId: number, remover = false): Promise<void> => {
    const r = await window.ancut.results.tagShot(shotId, characterId, remover)
    if (r?.error) {
      setAviso(r.error)
      return
    }
    setAviso(null)
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

      {aviso && (
        <p className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">
          <X className="size-3.5 shrink-0" />
          {aviso}
        </p>
      )}

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
              onMarcar={marcar}
              onMenu={(x, y, shot, grupo, grupoId) =>
                setMenu({ x, y, shot, anime: anime.anime, grupo, grupoId })
              }
              onAbrirDialogo={(shot, grupo) =>
                setMarcando({ shot, anime: anime.anime, grupo })
              }
            />
          </li>
        ))}
      </ul>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'Marcar personagem…',
              icon: Tag,
              onSelect: () =>
                setMarcando({ shot: menu.shot, anime: menu.anime, grupo: menu.grupo })
            },
            ...(menu.grupo !== SEM_PERSONAGEM && menu.grupoId
              ? [
                  {
                    label: `Não é ${menu.grupo}`,
                    icon: UserMinus,
                    onSelect: () => void marcar(menu.shot.id, menu.grupoId as number, true)
                  }
                ]
              : []),
            {
              label: 'Ir para a pasta',
              icon: FolderOpen,
              onSelect: () => void window.ancut.shell.reveal(menu.shot.absolute)
            },
            {
              label: 'Abrir no player',
              icon: PlayCircle,
              onSelect: () => void window.ancut.shell.open(menu.shot.absolute)
            },
            {
              label: 'Tirar dos favoritos',
              icon: Star,
              danger: true,
              onSelect: () => void desfavoritar(menu.shot)
            }
          ]}
        />
      )}

      {marcando && (
        <TagCharacterDialog
          anime={marcando.anime}
          atuais={marcando.grupo === SEM_PERSONAGEM ? [] : [marcando.grupo]}
          lista={elenco}
          onFechar={() => setMarcando(null)}
          onEscolher={(c) => {
            const alvo = marcando.shot
            setMarcando(null)
            void marcar(alvo.id, c.ids[0])
          }}
        />
      )}
    </div>
  )
}

function AnimeCard({
  anime,
  aberto,
  onAlternar,
  largura,
  url,
  onDesfavoritar,
  onMarcar,
  onMenu,
  onAbrirDialogo
}: {
  anime: FavoriteAnime
  aberto: boolean
  onAlternar: () => void
  largura: number
  url: (rel: string) => string | null
  onDesfavoritar: (s: FavoriteShot) => Promise<void>
  onMarcar: (shotId: number, characterId: number, remover?: boolean) => Promise<void>
  onMenu: (x: number, y: number, s: FavoriteShot, grupo: string, grupoId: number | null) => void
  onAbrirDialogo: (s: FavoriteShot, grupo: string) => void
}): JSX.Element {
  const [alvoDoDrop, setAlvoDoDrop] = useState<string | null>(null)
  const arrastando = useRef<number | null>(null)

  /**
   * O id do personagem daquele grupo, pra receber o clipe arrastado.
   *
   * Vem do próprio grupo, não de uma busca por nome no índice: o grupo aqui
   * pode se chamar "Rudeus" e o mesmo personagem no índice, "Greyrat,
   * Rudeus". Casar por texto falhava calado — o card perdia o alvo de solta e
   * a opção de desmarcar, sem nenhum aviso.
   */
  const idDoGrupo = (g: { characterIds?: number[] }): number | null =>
    // Opcional de propósito: a interface se atualiza sozinha e o motor nem
    // sempre vem junto (o delta da interface tem 1 MB, o do motor tem 47). Um
    // motor velho não manda `characterIds`, e sem a interrogação a aba
    // inteira caía em tela branca em vez de só ficar sem a correção manual.
    g.characterIds?.[0] ?? null

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
          {anime.characters.map((g) => {
            const recebe = g.character !== SEM_PERSONAGEM && idDoGrupo(g) !== null
            const iluminado = alvoDoDrop === g.character
            return (
              <div
                key={g.character}
                onDragOver={(e) => {
                  // Só o que TEM dono recebe: soltar em "Sem personagem" não
                  // significa nada, e um alvo que aceita e ignora é pior que
                  // um alvo que recusa.
                  if (!recebe || !e.dataTransfer.types.includes(TIPO_ARRASTO)) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setAlvoDoDrop(g.character)
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return
                  setAlvoDoDrop((a) => (a === g.character ? null : a))
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setAlvoDoDrop(null)
                  const id = Number(e.dataTransfer.getData(TIPO_ARRASTO)) || arrastando.current
                  const cid = idDoGrupo(g)
                  if (id && cid) void onMarcar(id, cid)
                }}
                className={cn(
                  'flex flex-col gap-1.5 rounded-md transition-colors',
                  iluminado && 'bg-primary/10 outline outline-1 outline-primary/60'
                )}
              >
                <div className="flex items-center gap-2 px-0.5">
                  <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.character}
                  </h3>
                  <span className="text-[11px] text-muted-foreground/60">
                    {g.shots.length} {g.shots.length === 1 ? 'clipe' : 'clipes'}
                  </span>
                  {g.character === SEM_PERSONAGEM && (
                    <span className="text-[11px] normal-case text-muted-foreground/50">
                      — ninguém foi reconhecido nestas cenas; arraste pelo punho até o
                      personagem certo, ou clique com o direito
                    </span>
                  )}
                  {iluminado && (
                    <span className="text-[11px] font-medium normal-case text-primary">
                      soltar aqui marca como {g.character}
                    </span>
                  )}
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
                        onMenu(e.clientX, e.clientY, s, g.character, idDoGrupo(g))
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

                      {/*
                        O punho existe porque o CARD já tem dono no arrasto: ele
                        entrega o arquivo ao Windows (é assim que o clipe entra
                        no editor dele). Se o mesmo gesto servisse pras duas
                        coisas, uma teria que morrer. Aqui o punho move a cena
                        DENTRO do app; o resto do card segue indo pro Windows.
                      */}
                      <span
                        draggable
                        title="Arraste até o personagem certo"
                        onDragStart={(e) => {
                          e.stopPropagation()
                          arrastando.current = s.id
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData(TIPO_ARRASTO, String(s.id))
                        }}
                        onDragEnd={() => {
                          arrastando.current = null
                          setAlvoDoDrop(null)
                        }}
                        onClick={(e) => {
                          // Clicar no punho também abre a escolha: nem todo
                          // mundo descobre que dá pra arrastar.
                          e.stopPropagation()
                          onAbrirDialogo(s, g.character)
                        }}
                        className="absolute left-1.5 top-1.5 z-10 grid size-5 cursor-grab place-items-center rounded bg-black/50 text-white/70 opacity-0 transition-all hover:text-primary group-hover:opacity-100 active:cursor-grabbing"
                      >
                        <GripVertical className="size-3.5" />
                      </span>

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
            )
          })}
        </div>
      )}
    </div>
  )
}
