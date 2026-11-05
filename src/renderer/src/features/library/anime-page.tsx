import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Combine,
  FolderOpen,
  Loader2,
  Move,
  Shapes,
  Share2,
  Square,
  UserSearch,
  Wand2
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ContextMenu } from '@/components/ui/context-menu'
import { cn, episodeLabel } from '@/lib/utils'
import { useNav } from '@/stores/nav-store'
import type { CharacterEntry, RecentEpisode } from '@shared/types'
import type { Anime } from './group-episodes'
import { Capa, Cobertura, Rosto } from './capa'

/**
 * A página de um anime (ou filme): capa, quanto dele já tem personagem
 * marcado, as ações com nome — eram cinco ícones sem rótulo na linha da
 * lista —, os personagens com rosto e os episódios com miniatura.
 *
 * O que já existia continua igual por baixo: arrastar um episódio até a aba
 * de outra temporada move ele pra lá, o clique direito tem as opções do
 * episódio, e "Descobrir personagens" marca episódios pro Modo Descoberta em
 * sequência.
 */
export function AnimePage({
  anime,
  onVoltar,
  onOpen,
  podeJuntar,
  onJuntar,
  onMudarTemporada,
  onMenu,
  onDescobrir,
  onExportar,
  onRepescar,
  repescando,
  ocupado,
  onOrganizar
}: {
  anime: Anime
  onVoltar: () => void
  onOpen: (episodeId: number) => void
  podeJuntar: boolean
  onJuntar: () => void
  onMudarTemporada: (alvo: { ids: number[]; rotulo: string; atual: number; destino?: number }) => void
  onMenu: (x: number, y: number, ep: RecentEpisode, temporada: number) => void
  onDescobrir: (eps: RecentEpisode[]) => void
  onExportar: () => void
  onRepescar: () => void
  repescando: boolean
  ocupado: boolean
  onOrganizar: () => void
}): JSX.Element {
  const ir = useNav((s) => s.ir)
  const [temporada, setTemporada] = useState(anime.temporadas[0]?.numero ?? 1)
  const [alvoArrasto, setAlvoArrasto] = useState<number | null>(null)
  const [mais, setMais] = useState<{ x: number; y: number } | null>(null)
  const [gente, setGente] = useState<CharacterEntry[] | null>(null)

  /**
   * Marcando episódios pro Modo Descoberta em sequência. A sequência é de UM
   * anime: a tela de batismo sugere nomes a partir do elenco dele.
   */
  const [marcando, setMarcando] = useState(false)
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const ordem = anime.temporadas.flatMap((t) => t.episodios)

  useEffect(() => {
    if (!anime.temporadas.some((t) => t.numero === temporada)) {
      setTemporada(anime.temporadas[0]?.numero ?? 1)
    }
  }, [anime, temporada])

  useEffect(() => {
    let vivo = true
    void window.ancut.results.characters().then((r) => {
      if (!vivo || !r) return
      setGente(
        r.characters
          .map((c) => ({ c, n: c.byAnime?.find((x) => x.anime === anime.nome)?.shots ?? 0 }))
          .filter((x) => x.n > 0)
          .sort((a, b) => b.n - a.n)
          .map((x) => ({ ...x.c, shots: x.n }))
      )
    })
    return () => {
      vivo = false
    }
  }, [anime.nome])

  const atual = anime.temporadas.find((t) => t.numero === temporada) ?? anime.temporadas[0]
  const semNinguem = anime.cenas - anime.marcadas
  const pct = anime.cenas ? Math.round((anime.marcadas / anime.cenas) * 100) : 0
  const capa = useMemo(() => anime.capaUrl, [anime.capaUrl])

  const alternarMarcado = (id: number): void =>
    setMarcados((a) => {
      const n = new Set(a)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const sairDaMarcacao = (): void => {
    setMarcando(false)
    setMarcados(new Set())
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Caminho" className="flex items-center gap-1.5 text-[13.5px] text-muted-foreground">
        <button type="button" onClick={onVoltar} className="text-primary hover:underline">
          Biblioteca
        </button>
        <ChevronRight className="size-3.5" />
        <span className="truncate text-foreground/90">{anime.nome}</span>
      </nav>

      <section className="flex flex-wrap items-stretch gap-7">
        <Capa url={capa} className="aspect-video w-[420px] max-w-full rounded-2xl shadow-elevated" />
        <div className="flex min-w-[360px] flex-1 flex-col justify-center gap-3.5">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight">{anime.nome}</h1>
          <p className="text-[14px] text-muted-foreground">
            {anime.temporadas.length} {anime.temporadas.length === 1 ? 'temporada' : 'temporadas'} ·{' '}
            {anime.episodios} {anime.episodios === 1 ? 'episódio' : 'episódios'} ·{' '}
            {anime.cenas.toLocaleString('pt-BR')} cenas
            {gente && gente.length > 0 && ` · ${gente.length} personagens`}
          </p>
          {anime.titulos.length > 1 && (
            <p className="text-[12.5px] text-muted-foreground/80" title={anime.titulos.join('\n')}>
              {anime.titulos.length} títulos diferentes no histórico
            </p>
          )}

          <div className="flex max-w-[640px] flex-col gap-2 rounded-xl border border-border/70 bg-surface/80 px-4 py-3">
            <div className="flex flex-wrap justify-between gap-2 text-[13.5px]">
              <span>
                <span className="font-semibold">{pct}%</span>{' '}
                <span className="text-muted-foreground">das cenas têm personagem marcado</span>
              </span>
              {semNinguem > 0 && (
                <span className="text-warning">{semNinguem.toLocaleString('pt-BR')} sem ninguém</span>
              )}
            </div>
            <Cobertura marcadas={anime.marcadas} cenas={anime.cenas} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              className="h-10 gap-2"
              disabled={ocupado}
              onClick={onRepescar}
              title="Procura personagem nas cenas que ficaram sem ninguém: compara com quem já está marcado e só marca quando as duas IAs concordam. O que não tiver certeza vira palpite."
            >
              {repescando ? <Loader2 className="animate-spin" /> : <UserSearch />}
              Achar quem ficou sem marca
            </Button>
            <Button
              variant={marcando ? 'primary' : 'secondary'}
              className="h-10 gap-2"
              title="Marque episódios pra identificar um depois do outro no Modo Descoberta: o app junta os rostos e você dá os nomes."
              onClick={() => (marcando ? sairDaMarcacao() : setMarcando(true))}
            >
              <Wand2 />
              Descobrir personagens
            </Button>
            <Button
              className="h-10 gap-2"
              title="Um .zip com os nomes, as fotos de rosto e o reconhecimento de cada personagem, pra outra pessoa importar no AnCut dela"
              onClick={onExportar}
            >
              <Share2 />
              Exportar personagens
            </Button>
            <Button className="h-10 gap-2" title={anime.pasta} onClick={() => void window.ancut.shell.reveal(anime.pasta)}>
              <FolderOpen />
              Abrir pasta
            </Button>
            <Button
              className="h-10 gap-1.5"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setMais({ x: r.left, y: r.bottom + 4 })
              }}
            >
              Mais
              <ChevronDown />
            </Button>
          </div>
        </div>
      </section>

      {gente && gente.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[16px] font-semibold">Personagens</h2>
            <button type="button" onClick={() => ir('personagens')} className="text-[13.5px] text-primary hover:underline">
              Ver todos
            </button>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {gente.slice(0, 10).map((p) => (
              <span
                key={p.name}
                className="flex items-center gap-2.5 rounded-full border border-border/70 bg-surface/80 py-1.5 pl-1.5 pr-4"
                title={p.aliases.length ? `também: ${p.aliases.join(', ')}` : undefined}
              >
                <Rosto url={p.avatarUrl} nome={p.name} />
                <span className="flex flex-col leading-tight">
                  <span className="text-[13.5px] font-semibold">{p.name}</span>
                  <span className="text-[11.5px] text-muted-foreground">{p.shots} cenas</span>
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[16px] font-semibold">{anime.filme ? 'Arquivos' : 'Episódios'}</h2>
          {anime.temporadas.length > 1 && (
            <div className="inline-flex gap-1 rounded-xl border border-border/70 bg-surface-sunken/70 p-1">
              {anime.temporadas.map((t) => (
                <button
                  key={t.numero}
                  type="button"
                  onClick={() => setTemporada(t.numero)}
                  // Soltar um episódio aqui move ele PRA ESTA temporada.
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes('application/x-ancut-episodio')) return
                    e.preventDefault()
                    setAlvoArrasto(t.numero)
                  }}
                  onDragLeave={() => setAlvoArrasto(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setAlvoArrasto(null)
                    const cru = e.dataTransfer.getData('application/x-ancut-episodio')
                    if (!cru) return
                    const info = JSON.parse(cru) as { id: number; rotulo: string; season: number }
                    if (info.season === t.numero) return
                    onMudarTemporada({ ids: [info.id], rotulo: info.rotulo, atual: info.season, destino: t.numero })
                  }}
                  className={cn(
                    'h-8 rounded-lg px-3.5 text-[13px] font-semibold transition-colors',
                    temporada === t.numero ? 'bg-surface-hover text-foreground' : 'text-muted-foreground hover:text-foreground',
                    alvoArrasto === t.numero && 'bg-primary/20 text-primary ring-1 ring-primary/50'
                  )}
                >
                  Temporada {t.numero} <span className="font-medium text-muted-foreground">{t.episodios.length}</span>
                </button>
              ))}
            </div>
          )}
          <span className="flex-1" />
          <span className="text-[12.5px] text-muted-foreground">
            {anime.temporadas.length > 1
              ? 'Arraste um episódio até outra temporada pra mover · clique direito pra mais opções'
              : 'Clique direito num episódio pra mais opções'}
          </span>
          {atual && (
            <button
              type="button"
              title={`Mudar a temporada destes ${atual.episodios.length} episódios`}
              onClick={() =>
                onMudarTemporada({
                  ids: atual.episodios.map((e) => e.episodeId),
                  rotulo: `Temporada ${atual.numero} inteira (${atual.episodios.length} episódios)`,
                  atual: atual.numero
                })
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              <Move className="size-3.5" />
              Mudar a temporada inteira
            </button>
          )}
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {(atual?.episodios ?? []).map((ep) => (
            <CartaoEpisodio
              key={ep.episodeId}
              ep={ep}
              temporada={atual?.numero ?? ep.season}
              onOpen={onOpen}
              onMenu={onMenu}
              marcado={marcando ? marcados.has(ep.episodeId) : undefined}
              onMarcar={() => alternarMarcado(ep.episodeId)}
            />
          ))}
        </div>
      </section>

      {marcando && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-surface-elevated/95 px-4 py-3 shadow-elevated backdrop-blur">
          <Wand2 className="size-4 shrink-0 text-primary" />
          <span className="text-[13px]">
            {marcados.size === 0
              ? 'Clique nos episódios pra marcar'
              : `${marcados.size} ${marcados.size === 1 ? 'marcado' : 'marcados'}`}
          </span>
          <button
            type="button"
            className="text-[12.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() =>
              setMarcados(marcados.size === ordem.length ? new Set() : new Set(ordem.map((e) => e.episodeId)))
            }
          >
            {marcados.size === ordem.length ? 'Desmarcar todos' : 'Marcar todos (todas as temporadas)'}
          </button>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={sairDaMarcacao}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="primary"
            className="gap-1.5"
            disabled={marcados.size === 0}
            title="Cada episódio para na tela de batismo esperando os nomes, e o próximo começa quando você salvar"
            onClick={() => {
              // Na ordem do anime, não na ordem em que foram clicados.
              onDescobrir(ordem.filter((e) => marcados.has(e.episodeId)))
              sairDaMarcacao()
            }}
          >
            <Wand2 />
            Modo Descoberta em {marcados.size || ''} {marcados.size === 1 ? 'episódio' : 'episódios'}
          </Button>
        </div>
      )}

      {mais && (
        <ContextMenu
          x={mais.x}
          y={mais.y}
          onClose={() => setMais(null)}
          items={[
            ...(podeJuntar
              ? [{ label: 'Juntar com outra pasta…', icon: Combine, onSelect: onJuntar }]
              : []),
            { label: 'Organizar os episódios (tipo, número, pasta)…', icon: Shapes, onSelect: onOrganizar }
          ]}
        />
      )}
    </div>
  )
}

function CartaoEpisodio({
  ep,
  temporada,
  onOpen,
  onMenu,
  marcado,
  onMarcar
}: {
  ep: RecentEpisode
  temporada: number
  onOpen: (episodeId: number) => void
  onMenu: (x: number, y: number, ep: RecentEpisode, temporada: number) => void
  /** Definido só no modo de marcação — aí o clique marca em vez de abrir. */
  marcado?: boolean
  onMarcar: () => void
}): JSX.Element {
  const rotulo = episodeLabel(ep.season, ep.episode, ep.kind)
  const marcando = marcado !== undefined
  const pct = ep.shotCount ? Math.round(((ep.tagged ?? 0) / ep.shotCount) * 100) : 0
  return (
    <button
      type="button"
      onClick={() => (marcando ? onMarcar() : onOpen(ep.episodeId))}
      title={marcando ? 'Clique pra marcar ou desmarcar' : `${ep.animeTitle} — arraste até outra temporada pra mover`}
      draggable={!marcando}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(e.clientX, e.clientY, ep, temporada)
      }}
      // Arrasto interno da tela (mover de temporada), não de arquivo pro
      // Windows: tipo próprio pra a aba saber que o que vem é um episódio.
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-ancut-episodio', JSON.stringify({ id: ep.episodeId, rotulo, season: temporada }))
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border bg-surface/80 text-left transition-all',
        marcando
          ? marcado
            ? 'border-primary ring-2 ring-primary/40'
            : 'border-border/70 hover:border-muted'
          : 'border-border/70 hover:-translate-y-0.5 hover:border-primary/40'
      )}
    >
      <span className="relative block">
        <Capa url={ep.coverUrl} className="aspect-video w-full" />
        <span className="absolute bottom-2 left-2 rounded-md bg-black/75 px-2 py-0.5 text-[12px] font-bold text-white">
          {rotulo}
        </span>
        {marcando && (
          <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-md bg-black/70">
            {marcado ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4 text-white/80" />}
          </span>
        )}
      </span>
      <span className="flex items-center justify-between gap-2 px-3 py-2.5 text-[12px]">
        <span className="text-muted-foreground">{ep.shotCount} cenas</span>
        <span className={cn(pct >= 60 ? 'text-primary' : pct > 0 ? 'text-warning' : 'text-muted-foreground')}>
          {ep.tagged ? `${pct}% com personagem` : 'só cortado'}
        </span>
      </span>
    </button>
  )
}
