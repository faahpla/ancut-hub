import { FileVideo, FolderOpen, Upload } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { useEpisodeStore } from '@/stores/episode-store'
import { cn, episodeSlug } from '@/lib/utils'
import type { EpisodeKind, MediaKind } from '@shared/types'

const VIDEO_RE = /\.(mp4|mkv|mov|avi|webm|ts|m2ts)$/i

const TIPOS: { valor: EpisodeKind; rotulo: string; dica: string }[] = [
  { valor: '', rotulo: 'Episódio', dica: 'Um episódio comum da temporada.' },
  {
    valor: 'OP',
    rotulo: 'Abertura',
    dica: 'Vai pra pasta S02-OP1, separada do episódio 1 da temporada.'
  },
  {
    valor: 'ED',
    rotulo: 'Encerramento',
    dica: 'Vai pra pasta S02-ED1, separada do episódio 1 da temporada.'
  },
  {
    valor: 'MOVIE',
    rotulo: 'Filme',
    dica: 'Filme não tem temporada nem episódio: vai pra pasta "Filme (ano)".'
  }
]

/**
 * Anime ou filme/série com gente de verdade. Ver `MediaKind`.
 *
 * "Filme" e não "Live action": é como o FAAH chama, e ele quase nunca pede
 * pra reconhecer gente de verdade — o que importa em filme é o corte certo.
 */
const MIDIAS: { valor: MediaKind; rotulo: string; dica: string }[] = [
  {
    valor: 'anime',
    rotulo: 'Anime',
    dica: 'Desenho: corte ajustado pra anime e reconhecimento de rosto desenhado, elenco do AniList.'
  },
  {
    valor: 'live',
    rotulo: 'Filme',
    dica:
      'Filme ou série com gente de verdade: o corte certo pra filmagem. Reconhecer as pessoas é ' +
      'opcional (usa o elenco do TMDB e baixa ~190 MB na primeira vez).'
  }
]

/** O que o arquivo é, conforme a mídia: filme com gente de verdade não tem
 *  abertura numerada nem encerramento separado. */
function tiposDa(midia: MediaKind): { valor: EpisodeKind; rotulo: string; dica: string }[] {
  if (midia === 'live') {
    return [
      { valor: 'MOVIE', rotulo: 'Filme', dica: 'Vai pra pasta "Filme (ano)", sem temporada nem episódio.' },
      { valor: '', rotulo: 'Episódio de série', dica: 'Um episódio, com temporada e número.' }
    ]
  }
  return TIPOS
}

/**
 * O arquivo a cortar.
 *
 * Sem arquivo: uma área grande pra soltar — é o primeiro gesto da tela, e ele
 * merece o espaço (era uma faixa fina no meio de oito campos). Soltando
 * vários de uma vez, todos vão pra fila. Com arquivo: o cartão com o que o
 * app entendeu do nome, e os campos pra corrigir.
 */
export function EpisodeForm({
  disabled,
  onVarios
}: {
  disabled: boolean
  /** Mais de um vídeo solto de uma vez: vão pra fila. */
  onVarios: (paths: string[]) => void
}): JSX.Element {
  const ep = useEpisodeStore()
  const [dragging, setDragging] = useState(false)

  const onDrop = (e: DragEvent<HTMLElement>): void => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    // `File.path` não existe desde o Electron 32 — o caminho real só vem por
    // webUtils, exposto pelo preload.
    const paths = Array.from(e.dataTransfer.files)
      .filter((f) => VIDEO_RE.test(f.name))
      .map((f) => window.ancutFiles.pathFor(f))
      .filter((p): p is string => Boolean(p))
    if (paths.length > 1) onVarios(paths)
    else if (paths[0]) void ep.applyFile(paths[0])
  }

  const pick = async (): Promise<void> => {
    const path = await window.ancut.dialog.pickVideo()
    if (path) void ep.applyFile(path)
  }

  const pickOut = async (): Promise<void> => {
    const path = await window.ancut.dialog.pickFolder(ep.outputDir)
    if (path) ep.set({ outputDir: path })
  }

  const fileName = ep.videoPath ? ep.videoPath.split(/[\\/]/).pop() : null
  const arrasto = {
    onDragOver: (e: DragEvent<HTMLElement>) => {
      e.preventDefault()
      if (!disabled) setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop
  }

  if (!fileName) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => void pick()}
        {...arrasto}
        className={cn(
          'flex w-full items-center gap-5 rounded-2xl border-2 border-dashed px-7 py-7 text-left transition-colors disabled:opacity-50',
          dragging ? 'border-primary bg-primary/[0.08]' : 'border-border bg-surface-sunken/50 hover:border-primary/50'
        )}
      >
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Upload className="size-6" />
        </span>
        <span className="flex flex-1 flex-col gap-1">
          <span className="text-[17px] font-semibold">Arraste os vídeos pra cá</span>
          <span className="text-[13.5px] text-muted-foreground">
            ou clique pra escolher · MKV, MP4 · vários de uma vez vão pra fila
          </span>
        </span>
        <span className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-[13.5px] font-semibold">
          Escolher arquivo
        </span>
      </button>
    )
  }

  const tipos = tiposDa(ep.mediaKind)
  const ehFilme = ep.kind === 'MOVIE'

  return (
    <article
      {...arrasto}
      className={cn('panel flex flex-col gap-4 p-5 transition-colors', dragging && 'border-primary bg-primary/[0.06]')}
    >
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <FileVideo className="size-6" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate text-[20px] font-bold leading-tight">{ep.anime || 'Sem nome'}</h2>
          <p className="truncate text-[12.5px] text-muted-foreground" title={ep.videoPath}>
            {fileName}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void pick()} disabled={disabled}>
          Trocar arquivo
        </Button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
        <Field label={ep.mediaKind === 'live' ? 'Título' : 'Anime'}>
          <Input
            value={ep.anime}
            disabled={disabled}
            placeholder={ep.mediaKind === 'live' ? 'Nome do filme ou da série' : 'Nome do anime'}
            onChange={(e) => ep.set({ anime: e.target.value })}
            list="pastas-de-anime"
            onBlur={async () => {
              // Ao digitar o nome na mão, recupera o OP/ED salvo desse anime.
              if (!ep.anime.trim()) return
              void ep.refreshFolder()
              const r = await window.ancut.episode.skipRanges(ep.anime.trim())
              if (!r) return
              if (r.skipHeadSeconds || r.skipTailSeconds) {
                ep.set({ skipHead: mmss(r.skipHeadSeconds), skipTail: mmss(r.skipTailSeconds) })
              }
            }}
          />
          {/* Escolher da lista é a forma mais barata de não inventar a 15ª
              grafia do mesmo anime. */}
          <datalist id="pastas-de-anime">
            {ep.existingFolders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Field>
        <Field label="O que é este arquivo">
          <Segmentado opcoes={tipos} valor={ep.kind} disabled={disabled} onChange={(v) => ep.set({ kind: v as EpisodeKind })} />
        </Field>
      </div>

      <div className={cn('grid gap-4', ehFilme ? 'grid-cols-1' : 'grid-cols-[96px_96px_minmax(0,1fr)]')}>
        {!ehFilme && (
          <>
            <Field label="Temporada">
              <Input
                type="number"
                min={1}
                max={50}
                value={ep.season}
                disabled={disabled}
                onChange={(e) => ep.set({ season: Number(e.target.value) || 1 })}
              />
            </Field>
            <Field label={ep.kind === 'OP' ? 'Abertura nº' : ep.kind === 'ED' ? 'Encerr. nº' : 'Episódio'}>
              <Input
                type="number"
                min={1}
                max={999}
                value={ep.episode}
                disabled={disabled}
                onChange={(e) => ep.set({ episode: Number(e.target.value) || 1 })}
              />
            </Field>
          </>
        )}
        <Field label="Salvar em">
          <div className="flex gap-2">
            <Input value={ep.outputDir} disabled={disabled} onChange={(e) => ep.set({ outputDir: e.target.value })} />
            <Button size="md" onClick={pickOut} disabled={disabled} className="shrink-0 gap-1.5">
              <FolderOpen />
              Escolher
            </Button>
          </div>
        </Field>
      </div>

      {ep.animeFolder && (
        <p className="-mt-1.5 truncate text-[12px] text-muted-foreground">
          Vai pra{' '}
          <span className="font-medium text-foreground">
            {ep.animeFolder}\{episodeSlug(ep.season, ep.episode, ep.kind)}
          </span>
          {ep.folderRemembered && ep.animeFolder !== ep.anime.trim() && (
            <span className="text-primary"> · pasta já usada para este título</span>
          )}
        </p>
      )}

      <MarcacoesDoArquivo />
    </article>
  )
}

/**
 * Anime ou Filme. Fica no topo da tela, fora do cartão do arquivo: a fila
 * usa a mesma escolha, e sem arquivo escolhido o cartão nem existe.
 */
export function MidiaToggle({ disabled }: { disabled: boolean }): JSX.Element {
  const ep = useEpisodeStore()
  return (
    <div className="w-[220px]">
      <Segmentado
        opcoes={MIDIAS}
        valor={ep.mediaKind}
        disabled={disabled}
        onChange={(v) => {
          const midia = v as MediaKind
          // Filme com gente de verdade não tem abertura/encerramento
          // numerado: o tipo acompanha.
          const kind = midia === 'live' && (ep.kind === 'OP' || ep.kind === 'ED') ? 'MOVIE' : ep.kind
          ep.set({ mediaKind: midia, kind })
          // Lembra pra próxima vez: quem corta filme costuma cortar vários.
          void window.ancut.settings.set({ mediaKind: midia })
        }}
      />
    </div>
  )
}

/** Escolha entre poucas opções, lado a lado (era uma fileira de botões soltos). */
function Segmentado({
  opcoes,
  valor,
  disabled,
  onChange
}: {
  opcoes: { valor: string; rotulo: string; dica: string }[]
  valor: string
  disabled: boolean
  onChange: (v: string) => void
}): JSX.Element {
  return (
    <div className="inline-flex w-full gap-1 rounded-lg border border-border bg-surface-sunken/80 p-1">
      {opcoes.map((o) => (
        <button
          key={o.valor || 'vazio'}
          type="button"
          disabled={disabled}
          title={o.dica}
          aria-pressed={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            'h-8 flex-1 whitespace-nowrap rounded-md px-3 text-[13px] font-semibold transition-colors disabled:opacity-50',
            valor === o.valor ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

/** Os campos de pular abertura/encerramento por tempo — moram em "Mais opções". */
export function PularPorTempo({ disabled }: { disabled: boolean }): JSX.Element {
  const ep = useEpisodeStore()
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Pular do começo (abertura)">
        <Input
          value={ep.skipHead}
          disabled={disabled}
          placeholder="ex.: 01:30"
          onChange={(e) => ep.set({ skipHead: e.target.value })}
        />
      </Field>
      <Field label="Pular do fim (encerramento)">
        <Input
          value={ep.skipTail}
          disabled={disabled}
          placeholder="ex.: 01:30"
          onChange={(e) => ep.set({ skipTail: e.target.value })}
        />
      </Field>
    </div>
  )
}

const NOME_DO_CAPITULO: Record<string, string> = {
  OP: 'Abertura',
  ED: 'Encerramento',
  RECAP: 'Recapitulação',
  PREVIEW: 'Prévia'
}

/**
 * O que o próprio arquivo marca como abertura, encerramento, recapitulação e
 * prévia — e o interruptor de pular.
 *
 * Grupos de release (a VARYG, que o FAAH usa) marcam isso em capítulos do
 * MKV; o DaVinci e o Premiere já importam. A abertura nem sempre vem no
 * começo — no Black Clover ela vai de 03:35 a 04:56, depois da cena fria —,
 * e é por isso que os campos de "ignorar" acima não davam conta.
 */
function MarcacoesDoArquivo(): JSX.Element | null {
  const ep = useEpisodeStore()
  const pulaveis = ep.chapters.filter((c) => c.kind)
  if (pulaveis.length === 0) return null
  const arquivoEhAbertura = ep.kind === 'OP' || ep.kind === 'ED'
  return (
    <div className="rounded-lg border border-border bg-surface-sunken/60 px-3.5 py-2.5 text-[12.5px]">
      <label className="flex cursor-pointer items-center gap-2 font-medium">
        <input
          type="checkbox"
          className="accent-primary"
          checked={ep.skipChapters}
          disabled={arquivoEhAbertura}
          onChange={(e) => ep.setSkipChapters(e.target.checked)}
        />
        Pular o que o arquivo marca
      </label>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-5 text-[11.5px] text-muted-foreground">
        {pulaveis.map((c) => (
          <span key={`${c.kind}-${c.start}`} className={cn(!ep.skipChapters && 'line-through opacity-60')}>
            {NOME_DO_CAPITULO[c.kind] ?? c.title} {mmss(c.start) || '00:00'}–{mmss(c.end)}
          </span>
        ))}
      </p>
      {arquivoEhAbertura && (
        <p className="mt-1 pl-5 text-[11.5px] text-muted-foreground">
          Este arquivo é uma abertura/encerramento: nada é pulado.
        </p>
      )}
    </div>
  )
}

function mmss(seconds: number): string {
  if (!seconds || seconds <= 0) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
