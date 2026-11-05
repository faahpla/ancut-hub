import {
  Clapperboard,
  Combine,
  Download,
  Film,
  FolderOpen,
  FolderSearch,
  Loader2,
  Move,
  PlayCircle,
  RefreshCw,
  Search,
  Shapes,
  Share2,
  Trash2,
  UserSearch,
  X
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ContextMenu } from '@/components/ui/context-menu'
import { cn, episodeLabel } from '@/lib/utils'
import { useNav } from '@/stores/nav-store'
import { useResultsStore } from '@/stores/results-store'
import type { RecentEpisode } from '@shared/types'
import { AnimePage } from './anime-page'
import { Capa, Cobertura } from './capa'
import { DeleteEpisodeDialog } from './delete-episode-dialog'
import { agruparPorAnime, filtrar, todosOsEpisodios, type Anime } from './group-episodes'
import { ImportCastDialog } from './import-cast-dialog'
import { MergeAnimeDialog } from './merge-anime-dialog'
import { OrganizeDialog } from './organize-dialog'
import { SeasonDialog } from './season-dialog'
import { ToBrollDialog } from './to-broll-dialog'

type Filtro = 'tudo' | 'series' | 'filmes'
type Ordem = 'recentes' | 'nome' | 'cenas' | 'menos'

/**
 * A Biblioteca: o acervo em capas, e — com um anime aberto — a página dele.
 *
 * Era uma lista de texto numa coluna estreita ("S01E01 · 444 cenas"), com
 * cinco ícones sem nome por linha. Na interface nova (11/2026) cada anime é
 * uma capa com a barrinha de quanto dele já tem personagem marcado, e o que
 * ficava espremido dentro da linha virou a página do anime (anime-page.tsx).
 *
 * Os diálogos (juntar, temporada, organizar, excluir, importar) moram aqui e
 * servem às duas telas: abrir um anime não pode perder o que estava aberto.
 *
 * As pastas esquecidas no disco continuam aqui embaixo: procurar episódio e
 * recuperar episódio são a mesma tarefa vista de dois ângulos.
 */
export function LibraryView({
  onOpen,
  onDescobrir
}: {
  onOpen: (episodeId: number) => void
  /** Episódios marcados pra identificar em sequência, no Modo Descoberta. */
  onDescobrir: (eps: RecentEpisode[], modo?: 'descobrir' | 'reconhecer') => void
}): JSX.Element {
  const {
    recent,
    loadingRecent,
    loadRecent,
    orphans,
    restoring,
    restoreOrphan,
    missingRoots,
    religando,
    ultimoReligar,
    atualizarBiblioteca
  } = useResultsStore()
  const { busca } = useResultsStore((s) => s.biblioteca)
  const setBiblioteca = useResultsStore((s) => s.setBiblioteca)
  const setBusca = (b: string): void => setBiblioteca({ busca: b })
  const animePasta = useNav((s) => s.animePasta)
  const abrirAnime = useNav((s) => s.abrirAnime)
  const ir = useNav((s) => s.ir)

  const [filtro, setFiltro] = useState<Filtro>('tudo')
  const [ordem, setOrdem] = useState<Ordem>('recentes')

  /** O que o último exportar/importar/repescar fez — uma linha no topo. */
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const exportarPersonagens = async (anime: Anime): Promise<void> => {
    const ids = todosOsEpisodios(anime).map((e) => e.episodeId)
    const r = await window.ancut.results.castExport(ids, anime.nome)
    if (!r) return
    if (r.erro || r.characters === 0) {
      setAviso({
        ok: false,
        texto: r.erro || `“${anime.nome}” ainda não tem personagem batizado pra exportar.`
      })
      return
    }
    // Nunca "ok" calado com pacote pela metade: foi assim que o Black Clover
    // chegou no Levi sem foto nenhuma e ninguém percebeu.
    const semFoto = r.withoutPhotos ?? []
    const base = `Exportado: ${r.characters} personagens de “${anime.nome}”, ${r.photos} fotos${r.merged ? `, ${r.merged} nomes repetidos juntados` : ''}.`
    if (semFoto.length === r.characters) {
      setAviso({
        ok: false,
        texto: `${base} ATENÇÃO: nenhum personagem saiu com foto — este pacote só ajuda no Modo Descoberta.`
      })
    } else if (semFoto.length > 0) {
      setAviso({
        ok: false,
        texto: `${base} ${semFoto.length} sem foto (só ajudam no Modo Descoberta): ${semFoto.slice(0, 5).join(', ')}${semFoto.length > 5 ? '…' : ''}.`
      })
    } else {
      setAviso({
        ok: true,
        texto: `${base} Todos com foto. Mande o .zip pra quem quiser — no AnCut dele, é “Importar personagens” aqui na Biblioteca.`
      })
    }
  }

  /**
   * Repescagem: cena com rosto e sem ninguém ganha o personagem quando as
   * duas IAs concordam. Pros episódios analisados antes dela existir — o
   * acervo do FAAH tinha 1.442 cenas assim só no Cyberpunk.
   */
  const [repescando, setRepescando] = useState<string | null>(null)
  const repescar = async (anime: Anime): Promise<void> => {
    if (repescando) return
    const ids = todosOsEpisodios(anime).map((e) => e.episodeId)
    setRepescando(anime.pasta)
    setAviso({ ok: true, texto: `Procurando personagem nas cenas sem ninguém de “${anime.nome}”...` })
    const parar = window.ancut.results.onRepescarEvent((ev) => {
      if (ev.type !== 'repescar-progresso') return
      setAviso({
        ok: true,
        texto: `Procurando personagem nas cenas sem ninguém de “${anime.nome}”: episódio ${ev.feitos} de ${ev.total}, ${ev.cenas} cenas marcadas até agora...`
      })
    })
    try {
      const r = await window.ancut.results.repescar(ids)
      if (!r) {
        setAviso({ ok: false, texto: 'A procura não terminou — tente de novo.' })
      } else if (r.erro) {
        setAviso({ ok: false, texto: r.erro })
      } else if (r.cenas === 0) {
        setAviso({
          ok: true,
          texto: `“${anime.nome}”: nenhuma cena nova com certeza suficiente. O que sobrou sem ninguém dá pra marcar à mão — o palpite aparece na lista “Sem ninguém” de cada episódio.`
        })
      } else {
        const quem = Object.entries(r.porPersonagem)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([n, c]) => `${n} (${c})`)
          .join(', ')
        setAviso({
          ok: true,
          texto: `“${anime.nome}”: mais ${r.cenas} cenas com personagem em ${r.episodios} episódios — ${quem}${Object.keys(r.porPersonagem).length > 6 ? '…' : ''}.`
        })
        void loadRecent()
      }
    } finally {
      parar()
      setRepescando(null)
    }
  }

  /** Pacote escolhido pra importar: a janela mostra o que ele traz e pergunta o anime. */
  const [importando, setImportando] = useState<string | null>(null)
  const importarPersonagens = async (): Promise<void> => {
    const arq = await window.ancut.results.castPick()
    if (arq) setImportando(arq)
  }

  /** Procurar também numa pasta escolhida — pro acervo que foi pra longe. */
  const procurarEmOutraPasta = async (): Promise<void> => {
    const pasta = await window.ancut.dialog.pickFolder()
    if (pasta) await atualizarBiblioteca(pasta)
  }

  /** Anime que o usuário quer fazer sumir dentro de outro. */
  const [juntando, setJuntando] = useState<Anime | null>(null)
  /** Episódios que vão mudar de temporada, e o rótulo do que são. */
  const [mudandoTemporada, setMudandoTemporada] = useState<{
    ids: number[]
    rotulo: string
    atual: number
    /** Só quando vem de arrasto: a temporada onde ele soltou. */
    destino?: number
  } | null>(null)
  /** Clique direito num episódio: posição e o episódio em questão. */
  const [menu, setMenu] = useState<{
    x: number
    y: number
    ep: RecentEpisode
    temporada: number
  } | null>(null)
  /** Clique direito numa capa de anime. */
  const [menuAnime, setMenuAnime] = useState<{ x: number; y: number; anime: Anime } | null>(null)
  const [excluindo, setExcluindo] = useState<{ id: number; rotulo: string } | null>(null)
  /** Episódios na janela de passar pra B-roll. */
  const [paraBroll, setParaBroll] = useState<{ ids: number[]; rotulo: string } | null>(null)
  /** Episódios na janela de organizar (tipo, número e pasta). */
  const [organizando, setOrganizando] = useState<RecentEpisode[] | null>(null)

  useEffect(() => {
    void loadRecent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const animes = useMemo(() => agruparPorAnime(recent), [recent])
  const buscando = busca.trim() !== ''
  const visiveis = useMemo(() => {
    const lista = filtrar(animes, busca).filter(
      (a) => filtro === 'tudo' || (filtro === 'filmes' ? a.filme : !a.filme)
    )
    const pct = (a: Anime): number => (a.cenas ? a.marcadas / a.cenas : 0)
    return [...lista].sort((a, b) =>
      ordem === 'nome'
        ? a.nome.localeCompare(b.nome, 'pt-BR')
        : ordem === 'cenas'
          ? b.cenas - a.cenas
          : ordem === 'menos'
            ? pct(a) - pct(b)
            : b.recente.localeCompare(a.recente)
    )
  }, [animes, busca, filtro, ordem])
  const nFilmes = animes.filter((a) => a.filme).length
  const aberto = animePasta ? animes.find((a) => a.pasta === animePasta) ?? null : null

  // Só engole a tela na PRIMEIRA carga. Nas outras a lista que já está aqui
  // continua valendo enquanto o motor responde.
  if (loadingRecent && recent.length === 0 && orphans.length === 0) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const avisos = (
    <>
      {aviso && (
        <p
          className={cn(
            'flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-relaxed',
            aviso.ok
              ? 'border-primary/40 bg-primary/[0.08] text-foreground'
              : 'border-warning/40 bg-warning/[0.08] text-muted-foreground'
          )}
        >
          <span className="flex-1">{aviso.texto}</span>
          <button
            type="button"
            aria-label="Fechar aviso"
            onClick={() => setAviso(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </p>
      )}
      {ultimoReligar && ultimoReligar.religados.length > 0 && (
        <p className="rounded-lg border border-primary/40 bg-primary/[0.08] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-primary">
            {ultimoReligar.religados.length}{' '}
            {ultimoReligar.religados.length === 1 ? 'episódio reencontrado' : 'episódios reencontrados'}
          </span>{' '}
          no lugar novo — o histórico já aponta pra lá.
        </p>
      )}
    </>
  )

  const dialogos = (
    <>
      {juntando && (
        <MergeAnimeDialog
          origem={juntando}
          animes={animes}
          onClose={() => setJuntando(null)}
          onDone={() => {
            setJuntando(null)
            // A pasta de origem sumiu: voltar pra grade em vez de mostrar uma
            // página de anime que não existe mais.
            ir('biblioteca')
            void loadRecent()
          }}
        />
      )}

      {mudandoTemporada && (
        <SeasonDialog
          episodeIds={mudandoTemporada.ids}
          rotulo={mudandoTemporada.rotulo}
          temporadaAtual={mudandoTemporada.atual}
          temporadaDestino={mudandoTemporada.destino}
          onClose={() => setMudandoTemporada(null)}
          onDone={() => {
            setMudandoTemporada(null)
            void loadRecent()
          }}
        />
      )}

      {paraBroll && (
        <ToBrollDialog
          episodeIds={paraBroll.ids}
          rotulo={paraBroll.rotulo}
          onClose={() => setParaBroll(null)}
          onDone={() => {
            setParaBroll(null)
            void loadRecent()
          }}
        />
      )}

      {menu && menu.ep.kind === 'BROLL' && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Abrir', icon: PlayCircle, onSelect: () => onOpen(menu.ep.episodeId) },
            {
              label: 'Abrir a pasta',
              icon: FolderOpen,
              onSelect: () => void window.ancut.shell.reveal(menu.ep.episodeRoot)
            },
            {
              label: 'Excluir…',
              icon: Trash2,
              danger: true,
              onSelect: () =>
                setExcluindo({
                  id: menu.ep.episodeId,
                  rotulo: episodeLabel(menu.ep.season, menu.ep.episode, menu.ep.kind, menu.ep.titulo)
                })
            }
          ]}
        />
      )}

      {menu && menu.ep.kind !== 'BROLL' && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Abrir', icon: PlayCircle, onSelect: () => onOpen(menu.ep.episodeId) },
            {
              label: 'Abrir a pasta',
              icon: FolderOpen,
              onSelect: () => void window.ancut.shell.reveal(menu.ep.episodeRoot)
            },
            {
              label: 'Mudar a temporada…',
              icon: Move,
              onSelect: () =>
                setMudandoTemporada({
                  ids: [menu.ep.episodeId],
                  rotulo: episodeLabel(menu.ep.season, menu.ep.episode, menu.ep.kind),
                  atual: menu.temporada
                })
            },
            {
              label: 'Mudar o tipo (abertura, encerramento)…',
              icon: Shapes,
              onSelect: () => setOrganizando([menu.ep])
            },
            {
              label: 'Passar pra B-roll…',
              icon: Film,
              onSelect: () =>
                setParaBroll({
                  ids: [menu.ep.episodeId],
                  rotulo: episodeLabel(menu.ep.season, menu.ep.episode, menu.ep.kind)
                })
            },
            {
              label: 'Excluir…',
              icon: Trash2,
              danger: true,
              onSelect: () =>
                setExcluindo({
                  id: menu.ep.episodeId,
                  rotulo: episodeLabel(menu.ep.season, menu.ep.episode, menu.ep.kind)
                })
            }
          ]}
        />
      )}

      {menuAnime && (
        <ContextMenu
          x={menuAnime.x}
          y={menuAnime.y}
          onClose={() => setMenuAnime(null)}
          items={[
            { label: 'Abrir', icon: PlayCircle, onSelect: () => abrirAnime(menuAnime.anime.pasta) },
            {
              label: 'Achar quem ficou sem marca',
              icon: UserSearch,
              onSelect: () => void repescar(menuAnime.anime)
            },
            {
              label: 'Exportar personagens…',
              icon: Share2,
              onSelect: () => void exportarPersonagens(menuAnime.anime)
            },
            ...(animes.length > 1
              ? [{ label: 'Juntar com outra pasta…', icon: Combine, onSelect: () => setJuntando(menuAnime.anime) }]
              : []),
            {
              label: 'Abrir a pasta',
              icon: FolderOpen,
              onSelect: () => void window.ancut.shell.reveal(menuAnime.anime.pasta)
            }
          ]}
        />
      )}

      {importando && (
        <ImportCastDialog
          file={importando}
          sugestoes={animes.map((a) => a.nome)}
          onClose={() => setImportando(null)}
          onDone={(r) => {
            setImportando(null)
            const semFoto = r.withoutPhotos ?? []
            setAviso({
              ok: semFoto.length < r.characters,
              texto:
                `Importado: ${r.characters} personagens ligados a “${r.title}”, ${r.photos} fotos novas. ` +
                (semFoto.length === r.characters
                  ? 'Nenhum veio com foto: eles só ajudam no Modo Descoberta.'
                  : 'A próxima análise desse anime — de qualquer temporada — já reconhece eles.')
            })
          }}
        />
      )}

      {organizando && (
        <OrganizeDialog
          episodios={organizando}
          animes={animes}
          onClose={() => setOrganizando(null)}
          onDone={() => {
            setOrganizando(null)
            void loadRecent()
          }}
        />
      )}

      {excluindo && (
        <DeleteEpisodeDialog
          episodeId={excluindo.id}
          rotulo={excluindo.rotulo}
          onClose={() => setExcluindo(null)}
          onDone={() => {
            setExcluindo(null)
            void loadRecent()
          }}
        />
      )}
    </>
  )

  if (aberto) {
    return (
      <div className="animate-rise-in mx-auto flex w-full max-w-[1500px] flex-col gap-4">
        {avisos}
        <AnimePage
          anime={aberto}
          onVoltar={() => ir('biblioteca')}
          onOpen={onOpen}
          podeJuntar={animes.length > 1}
          onJuntar={() => setJuntando(aberto)}
          onMudarTemporada={setMudandoTemporada}
          onMenu={(x, y, ep, temporada) => setMenu({ x, y, ep, temporada })}
          onDescobrir={onDescobrir}
          onExportar={() => void exportarPersonagens(aberto)}
          onRepescar={() => void repescar(aberto)}
          repescando={repescando === aberto.pasta}
          ocupado={repescando !== null}
          onOrganizar={() => setOrganizando(aberto.temporadas.flatMap((t) => t.episodios))}
          onBroll={(ids, rotulo) => setParaBroll({ ids, rotulo })}
        />
        {dialogos}
      </div>
    )
  }

  const recentes = recent.slice(0, 4)

  return (
    <div className="animate-rise-in mx-auto flex w-full max-w-[1500px] flex-col gap-5">
      <header className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[260px] flex-1 flex-col gap-1">
          <h1 className="text-[26px] font-bold tracking-tight">Biblioteca</h1>
          <p className="text-[14px] text-muted-foreground">
            {animes.length} {animes.length === 1 ? 'título' : 'títulos'} · {recent.length}{' '}
            {recent.length === 1 ? 'episódio' : 'episódios'} ·{' '}
            {recent.reduce((s, e) => s + e.shotCount, 0).toLocaleString('pt-BR')} cenas
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar anime, filme ou série…"
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
        {buscando && visiveis.length > 0 && (
          <Button
            className="h-10 gap-1.5"
            title="Mudar o tipo (episódio, abertura, encerramento), o número e a pasta de tudo que apareceu na busca, de uma vez"
            onClick={() => setOrganizando(visiveis.flatMap((a) => a.temporadas.flatMap((t) => t.episodios)))}
          >
            <Shapes />
            Organizar o que apareceu
          </Button>
        )}
        <Button
          className="h-10 gap-1.5"
          disabled={religando}
          title="Procura de novo as pastas dos episódios — pra quando você mudou anime de pasta no Explorer. Nada é movido nem apagado."
          onClick={() => void atualizarBiblioteca()}
        >
          <RefreshCw className={cn(religando && 'animate-spin')} />
          Atualizar pastas
        </Button>
        <Button
          className="h-10 gap-1.5"
          title="Abre um pacote de personagens exportado por outro AnCut: nomes, fotos de rosto e o reconhecimento de cada um. Só soma — nada daqui é apagado."
          onClick={() => void importarPersonagens()}
        >
          <Download />
          Importar personagens
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-xl border border-border/70 bg-surface-sunken/70 p-1">
          {(
            [
              ['tudo', 'Tudo', animes.length],
              ['series', 'Animes', animes.length - nFilmes],
              ['filmes', 'Filmes', nFilmes]
            ] as const
          ).map(([id, rotulo, n]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              aria-pressed={filtro === id}
              className={cn(
                'h-8 rounded-lg px-3.5 text-[13px] font-semibold transition-colors',
                filtro === id ? 'bg-surface-hover text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {rotulo} <span className="font-medium text-muted-foreground">{n}</span>
            </button>
          ))}
        </div>
        <select
          aria-label="Ordem"
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as Ordem)}
          className="h-10 rounded-lg border border-border bg-surface-sunken/80 px-2.5 text-[13px] outline-none focus:border-primary/60"
        >
          <option value="recentes">Analisados por último</option>
          <option value="nome">Nome</option>
          <option value="cenas">Mais cenas</option>
          <option value="menos">Menos personagens marcados</option>
        </select>
        <span className="flex-1" />
        {missingRoots > 0 && (
          <button
            type="button"
            disabled={religando}
            onClick={() => void procurarEmOutraPasta()}
            title="A pasta foi apagada, ou movida pra um lugar onde o app não procurou. Nada foi perdido do lado do histórico. Se você mudou o anime de lugar, mostre onde ele está agora."
            className="inline-flex h-9 items-center gap-2 rounded-full bg-warning/[0.12] px-3.5 text-[12.5px] font-medium text-warning hover:bg-warning/20"
          >
            <FolderSearch className="size-4" />
            {missingRoots} {missingRoots === 1 ? 'episódio sem pasta no disco' : 'episódios sem pasta no disco'} ·
            procurar
          </button>
        )}
      </div>

      {avisos}

      {recent.length === 0 && orphans.length === 0 ? (
        <div className="grid min-h-[320px] place-items-center">
          <div className="flex max-w-[360px] flex-col items-center gap-2 text-center">
            <Clapperboard className="size-9 text-muted-foreground/50" />
            <p className="text-[15px] font-semibold">Biblioteca vazia</p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Corte um episódio ou um filme em “Novo corte”. Ele entra aqui com capa,
              organizado por título e temporada.
            </p>
            <Button variant="primary" className="mt-2" onClick={() => ir('novo')}>
              Novo corte
            </Button>
          </div>
        </div>
      ) : (
        <>
          {!buscando && recentes.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-[14px] font-semibold text-muted-foreground">Analisados por último</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                {recentes.map((ep) => (
                  <button
                    key={ep.episodeId}
                    type="button"
                    onClick={() => onOpen(ep.episodeId)}
                    className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface/80 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-surface-hover/70"
                  >
                    <Capa url={ep.coverUrl} className="h-[50px] w-[88px] shrink-0 rounded-md" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[13.5px] font-semibold">{ep.animeTitle}</span>
                      <span className="text-[12px] text-muted-foreground">
                        {episodeLabel(ep.season, ep.episode, ep.kind, ep.titulo)} · {ep.shotCount} cenas
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-3">
            {!buscando && (
              <h2 className="text-[14px] font-semibold text-muted-foreground">
                {filtro === 'filmes' ? 'Filmes' : filtro === 'series' ? 'Animes' : 'Tudo no acervo'}
              </h2>
            )}
            {visiveis.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">
                {buscando ? `Nada com “${busca}”.` : 'Nada aqui ainda.'}
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(236px,1fr))] gap-4">
                {visiveis.map((anime) => (
                  <CartaoAnime
                    key={anime.pasta}
                    anime={anime}
                    repescando={repescando === anime.pasta}
                    onAbrir={() => abrirAnime(anime.pasta)}
                    onMenu={(x, y) => setMenuAnime({ x, y, anime })}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {orphans.length > 0 && (
        <section className="mt-2 flex flex-col gap-2">
          <header className="flex items-center gap-2">
            <FolderSearch className="size-4 text-muted-foreground" />
            <h2 className="text-[14px] font-semibold">Pastas encontradas na saída</h2>
            <span className="text-[12px] text-muted-foreground">({orphans.length})</span>
          </header>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Episódios que já foram analisados e continuam completos no disco, mas
            sumiram do histórico. Trazer de volta é leitura de arquivo — nada é
            cortado de novo.
          </p>
          {orphans.map((o) => (
            <div key={o.root} className="panel flex items-center gap-3 px-3.5 py-2.5" title={o.root}>
              <FolderSearch className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{o.anime}</span>
              <span className="tabular shrink-0 text-[12px] text-muted-foreground">
                {episodeLabel(o.season, o.episode, o.kind)}
              </span>
              <span className="tabular w-20 shrink-0 text-right text-[12px] text-muted-foreground/70">
                {o.shots} cenas
              </span>
              <Button size="sm" disabled={restoring !== ''} onClick={() => void restoreOrphan(o.root)}>
                {restoring === o.root ? 'Trazendo…' : 'Trazer de volta'}
              </Button>
            </div>
          ))}
        </section>
      )}

      {dialogos}
    </div>
  )
}

function CartaoAnime({
  anime,
  repescando,
  onAbrir,
  onMenu
}: {
  anime: Anime
  repescando: boolean
  onAbrir: () => void
  onMenu: (x: number, y: number) => void
}): JSX.Element {
  const t = anime.temporadas.length
  const selo =
    t === 0 && anime.broll.length > 0
      ? 'B-roll'
      : anime.filme
        ? 'Filme'
        : `${t} ${t === 1 ? 'temporada' : 'temporadas'}`
  return (
    <button
      type="button"
      onClick={onAbrir}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(e.clientX, e.clientY)
      }}
      title={anime.titulos.length > 1 ? `Títulos no histórico:\n${anime.titulos.join('\n')}` : anime.pasta}
      className="group flex flex-col overflow-hidden rounded-xl border border-border/70 bg-surface/80 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40"
    >
      <span className="relative block">
        <Capa url={anime.capaUrl} className="aspect-video w-full" />
        <span className="absolute left-2.5 top-2.5 rounded-full bg-black/70 px-2.5 py-0.5 text-[11.5px] font-semibold text-white">
          {selo}
        </span>
        {repescando && (
          <span className="absolute right-2.5 top-2.5 grid size-7 place-items-center rounded-full bg-black/70 text-primary">
            <Loader2 className="size-4 animate-spin" />
          </span>
        )}
      </span>
      <span className="flex flex-col gap-2 px-3.5 pb-3.5 pt-3">
        <span className="truncate text-[14.5px] font-semibold">{anime.nome}</span>
        <span className="text-[12.5px] text-muted-foreground">
          {[
            anime.episodios > 0 && `${anime.episodios} ${anime.episodios === 1 ? 'episódio' : 'episódios'}`,
            anime.broll.length > 0 && `${anime.broll.length} de B-roll`,
            `${anime.cenas.toLocaleString('pt-BR')} cenas`
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <Cobertura marcadas={anime.marcadas} cenas={anime.cenas} />
      </span>
    </button>
  )
}
