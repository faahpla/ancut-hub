import {
  CheckCircle2,
  CircleAlert,
  Clock,
  Download,
  FilePlus2,
  Loader2,
  Play,
  ScanFace,
  Square,
  SkipForward,
  Trash2,
  Wand2,
  X
} from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { cn, episodeLabel } from '@/lib/utils'
import { useQueueStore, type ItemFila, type ModoItem, type StatusItem } from '@/stores/queue-store'

/** O que a fila faz com cada episódio. Escolhido uma vez pra leva toda. */
const MODOS: { valor: ModoItem; rotulo: string; explica: string }[] = [
  {
    valor: 'cortar',
    rotulo: 'Só cortar',
    explica: 'Corta em cenas e para. Sem internet e sem reconhecer ninguém — o mais rápido.'
  },
  {
    valor: 'reconhecer',
    rotulo: 'Análise rápida',
    explica:
      'Corta e marca sozinho quem o app já conhece: o elenco do AniList e quem você batizou no Modo Descoberta. Não para pra perguntar nada.'
  },
  {
    valor: 'descobrir',
    rotulo: 'Descoberta',
    explica: 'Junta os rostos e pede os nomes. Quem já foi batizado em outro episódio vem preenchido.'
  }
]

const VIDEO_RE = /\.(mp4|mkv|mov|avi|webm|ts|m2ts)$/i

/**
 * A fila de cortes.
 *
 * Fica recolhida num convite de uma linha enquanto está vazia: a aba
 * Analisar é a tela de "um episódio agora", e uma lista vazia ocupando
 * espaço todo dia serviria à minoria das vezes.
 */
export function QueuePanel({
  onVerResultado
}: {
  onVerResultado: (episodeId: number) => void
}): JSX.Element {
  const {
    itens,
    rodando,
    lendo,
    adicionar,
    remover,
    limparProntos,
    iniciar,
    parar,
    modoNovos,
    setModoNovos,
    descobertaSozinha,
    setDescobertaSozinha
  } = useQueueStore()
  const [dragging, setDragging] = useState(false)

  const escolher = async (): Promise<void> => {
    const paths = await window.ancut.dialog.pickVideos()
    await adicionar(paths)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragging(false)
    const paths = Array.from(e.dataTransfer.files)
      .filter((f) => VIDEO_RE.test(f.name))
      .map((f) => window.ancutFiles.pathFor(f))
      .filter(Boolean)
    if (paths.length > 0) void adicionar(paths)
  }

  const esperando = itens.filter((i) => i.status === 'esperando').length
  const prontos = itens.filter((i) => i.status === 'pronto' || i.status === 'pulado').length
  const falhos = itens.filter((i) => i.status === 'falhou').length

  // Sem número de passo de propósito: 1, 2 e 3 são o caminho de UM episódio,
  // e a fila é o caminho paralelo. Numerá-la sugeriria que ela vem depois do
  // "Modo de reconhecimento", que ela ignora.
  return (
    <Panel title="Fila de cortes" compact>
      <div
        onDragOver={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col gap-2 rounded-md p-1 transition-colors',
          dragging && 'bg-primary/[0.07] outline-dashed outline-1 outline-primary'
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={escolher}>
            {lendo ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
            Adicionar episódios
          </Button>

          {itens.length > 0 &&
            (rodando ? (
              <Button size="sm" variant="danger" className="gap-1.5" onClick={parar}>
                <Square />
                Parar fila
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                className="gap-1.5"
                disabled={esperando === 0}
                onClick={() => void iniciar()}
              >
                <Play />
                {rotuloComecar(itens.filter((i) => i.status === 'esperando'))}
              </Button>
            ))}

          <span className="flex-1" />

          {prontos > 0 && !rodando && (
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={limparProntos}>
              <Trash2 />
              Tirar os prontos
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="inline-flex w-full gap-1 rounded-lg border border-border bg-surface-sunken/80 p-1">
            {MODOS.map((m) => (
              <button
                key={m.valor}
                type="button"
                title={m.explica}
                aria-pressed={modoNovos === m.valor}
                onClick={() => setModoNovos(m.valor)}
                className={cn(
                  'h-7 flex-1 whitespace-nowrap rounded-md px-2 text-[12px] font-semibold transition-colors',
                  modoNovos === m.valor ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {m.rotulo}
              </button>
            ))}
          </div>
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            {MODOS.find((m) => m.valor === modoNovos)?.explica}
          </p>
          {(modoNovos === 'descobrir' || itens.some((i) => i.modo === 'descobrir' && i.status === 'esperando')) && (
            <label className="flex cursor-pointer items-start gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={descobertaSozinha}
                onChange={(e) => setDescobertaSozinha(e.target.checked)}
                className="mt-0.5 size-3.5 shrink-0 accent-primary"
              />
              <span>
                Só parar quando aparecer personagem novo
                <span className="block text-[11.5px] text-muted-foreground">
                  Se todo mundo do episódio já foi batizado antes, a fila confirma sozinha e segue.
                </span>
              </span>
            </label>
          )}
        </div>

        {itens.length === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Arraste vários episódios aqui (ou use o botão) e eles rodam um depois do
            outro, do jeito escolhido acima. Episódio já cortado se identifica pela
            Biblioteca: na página do anime,{' '}
            <strong className="font-semibold text-foreground">Descobrir personagens</strong>{' '}
            marca vários de uma vez.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-1">
              {itens.map((i) => (
                <Linha
                  key={i.id}
                  item={i}
                  podeRemover={!rodando || (i.status !== 'cortando' && i.status !== 'baixando')}
                  onRemover={() => remover(i.id)}
                  onVerResultado={onVerResultado}
                />
              ))}
            </ul>

            <p className="text-[11.5px] text-muted-foreground">
              {prontos > 0 && `${prontos} pronto${prontos > 1 ? 's' : ''}. `}
              {falhos > 0 && `${falhos} falhou${falhos > 1 ? '/falharam' : ''}. `}
              {itens.some((i) => i.modo === 'descobrir' && i.status !== 'pronto')
                ? descobertaSozinha
                  ? 'Na Descoberta, a fila só para no batismo quando aparece gente nova. '
                  : 'Na Descoberta, cada episódio para na tela de batismo esperando os nomes. '
                : ''}
              A fila usa a escolha Anime/Filme do topo da tela.
            </p>
          </>
        )}
      </div>
    </Panel>
  )
}

/** O botão diz o que vai acontecer, que depende do que está esperando. */
function rotuloComecar(esperando: ItemFila[]): string {
  const n = esperando.length
  const eps = n === 1 ? 'episódio' : 'episódios'
  const descobrir = esperando.filter((i) => i.modo === 'descobrir').length
  const rapida = esperando.filter((i) => i.modo === 'reconhecer').length
  if (rapida === n) return `Análise rápida em ${n} ${eps}`
  const links = esperando.filter((i) => i.link && !i.videoPath).length
  if (links === n) return `Baixar e cortar ${n} ${n === 1 ? 'vídeo' : 'vídeos'}`
  if (descobrir === 0 && links === 0) return `Cortar ${n} ${eps}`
  if (descobrir === n) return `Modo Descoberta em ${n} ${eps}`
  return `Começar fila (${n} ${eps})`
}

const CORES: Record<StatusItem, string> = {
  esperando: 'text-muted-foreground',
  baixando: 'text-primary',
  cortando: 'text-primary',
  pronto: 'text-primary',
  falhou: 'text-warning',
  pulado: 'text-muted-foreground'
}

function Icone({ status }: { status: StatusItem }): JSX.Element {
  if (status === 'cortando') return <Loader2 className="size-3.5 animate-spin" />
  if (status === 'baixando') return <Download className="size-3.5 animate-pulse" />
  if (status === 'pronto') return <CheckCircle2 className="size-3.5" />
  if (status === 'falhou') return <CircleAlert className="size-3.5" />
  if (status === 'pulado') return <SkipForward className="size-3.5" />
  return <Clock className="size-3.5" />
}

function Linha({
  item,
  podeRemover,
  onRemover,
  onVerResultado
}: {
  item: ItemFila
  podeRemover: boolean
  onRemover: () => void
  onVerResultado: (episodeId: number) => void
}): JSX.Element {
  const rotulo =
    item.kind === 'BROLL'
      ? `${item.anime} · ${item.titulo || item.nomeArquivo}`
      : item.anime
        ? `${item.anime} ${episodeLabel(item.season, item.episode, item.kind)}`
        : item.nomeArquivo

  return (
    <li
      className={cn(
        'group flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px]',
        item.status === 'cortando' || item.status === 'baixando'
          ? 'border-primary/40 bg-primary/[0.08]'
          : 'border-border bg-surface-sunken/50'
      )}
    >
      <span className={cn('shrink-0', CORES[item.status])}>
        <Icone status={item.status} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">{rotulo}</span>
          {item.modo === 'reconhecer' && item.kind !== 'BROLL' && (
            <span className="flex shrink-0 items-center gap-1 rounded bg-primary/15 px-1.5 py-px text-[10.5px] font-semibold text-primary">
              <ScanFace className="size-3" />
              rápida
            </span>
          )}
          {item.modo === 'descobrir' && item.kind !== 'BROLL' && (
            <span className="flex shrink-0 items-center gap-1 rounded bg-primary/15 px-1.5 py-px text-[10.5px] font-semibold text-primary">
              <Wand2 className="size-3" />
              descoberta
            </span>
          )}
        </span>
        {item.status === 'baixando' && (
          <span className="mt-1 flex flex-col gap-1">
            <span className="block truncate text-[11.5px] text-muted-foreground">{item.etapa}</span>
            <span className="block h-1 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  'block h-full rounded-full bg-primary transition-[width]',
                  (item.progresso ?? -1) < 0 && 'w-1/3 animate-pulse'
                )}
                style={(item.progresso ?? -1) >= 0 ? { width: `${Math.round((item.progresso ?? 0) * 100)}%` } : undefined}
              />
            </span>
          </span>
        )}
        {item.erro && (
          <span
            className={cn(
              'block truncate text-[11.5px]',
              item.status === 'pulado' ? 'text-muted-foreground' : 'text-warning'
            )}
          >
            {item.erro}
          </span>
        )}
        {item.nota && (
          <span className="block truncate text-[11.5px] text-primary/90" title={item.nota}>
            {item.nota}
          </span>
        )}
        {item.status === 'pronto' && item.shots !== undefined && (
          <span className="block text-[11.5px] text-muted-foreground">
            {item.shots} cenas
          </span>
        )}
      </span>

      {(item.status === 'pronto' || item.status === 'pulado') && item.episodeId !== undefined && (
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0"
          onClick={() => onVerResultado(item.episodeId as number)}
        >
          Ver
        </Button>
      )}

      {podeRemover && (
        <button
          type="button"
          aria-label={`Tirar ${rotulo} da fila`}
          onClick={onRemover}
          className="grid size-5 shrink-0 place-items-center rounded opacity-0 transition-all hover:bg-surface-elevated hover:text-foreground group-hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      )}
    </li>
  )
}
