import {
  CheckCircle2,
  CircleAlert,
  Clock,
  FilePlus2,
  Loader2,
  Play,
  Square,
  Trash2,
  X
} from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { cn, episodeLabel } from '@/lib/utils'
import { useQueueStore, type ItemFila, type StatusItem } from '@/stores/queue-store'

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
  const { itens, rodando, lendo, adicionar, remover, limparProntos, iniciar, parar } =
    useQueueStore()
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
  const prontos = itens.filter((i) => i.status === 'pronto').length
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
                Cortar {esperando} {esperando === 1 ? 'episódio' : 'episódios'}
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

        {itens.length === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Arraste vários episódios aqui (ou use o botão) e eles são cortados em
            cenas, um depois do outro, sem precisar de você. Os personagens ficam
            pra depois: cada episódio pronto ganha um botão{' '}
            <strong className="font-semibold text-foreground">
              Identificar personagens
            </strong>{' '}
            na aba Resultados.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-1">
              {itens.map((i) => (
                <Linha
                  key={i.id}
                  item={i}
                  podeRemover={!rodando || i.status !== 'cortando'}
                  onRemover={() => remover(i.id)}
                  onVerResultado={onVerResultado}
                />
              ))}
            </ul>

            <p className="text-[11.5px] text-muted-foreground">
              {prontos > 0 && `${prontos} pronto${prontos > 1 ? 's' : ''}. `}
              {falhos > 0 && `${falhos} falhou${falhos > 1 ? '/falharam' : ''}. `}
              A fila usa a pasta de saída e o tipo de mídia do formulário acima.
            </p>
          </>
        )}
      </div>
    </Panel>
  )
}

const CORES: Record<StatusItem, string> = {
  esperando: 'text-muted-foreground',
  cortando: 'text-primary',
  pronto: 'text-primary',
  falhou: 'text-warning'
}

function Icone({ status }: { status: StatusItem }): JSX.Element {
  if (status === 'cortando') return <Loader2 className="size-3.5 animate-spin" />
  if (status === 'pronto') return <CheckCircle2 className="size-3.5" />
  if (status === 'falhou') return <CircleAlert className="size-3.5" />
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
  const rotulo = item.anime
    ? `${item.anime} ${episodeLabel(item.season, item.episode, item.kind)}`
    : item.nomeArquivo

  return (
    <li
      className={cn(
        'group flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px]',
        item.status === 'cortando'
          ? 'border-primary/40 bg-primary/[0.08]'
          : 'border-border bg-surface-sunken/50'
      )}
    >
      <span className={cn('shrink-0', CORES[item.status])}>
        <Icone status={item.status} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{rotulo}</span>
        {item.erro && (
          <span className="block truncate text-[11.5px] text-warning">{item.erro}</span>
        )}
        {item.status === 'pronto' && item.shots !== undefined && (
          <span className="block text-[11.5px] text-muted-foreground">
            {item.shots} cenas
          </span>
        )}
      </span>

      {item.status === 'pronto' && item.episodeId !== undefined && (
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
