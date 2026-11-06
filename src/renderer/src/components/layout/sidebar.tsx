import {
  Clapperboard,
  ListVideo,
  Plus,
  ScanSearch,
  Settings,
  Star,
  Users,
  type LucideIcon
} from 'lucide-react'
import logoUrl from '@/assets/logo-header.png'
import type { AppInfo } from '@shared/types'
import { DeviceBadge } from './device-badge'
import { cn } from '@/lib/utils'
import { useAnalysisStore } from '@/stores/analysis-store'
import { useNav, type Pagina } from '@/stores/nav-store'
import { useQueueStore } from '@/stores/queue-store'
import { useResultsStore } from '@/stores/results-store'

/**
 * O menu lateral da interface nova.
 *
 * Substitui as três abas do topo: com Personagens, Cenas e Favoritos virando
 * página, as abas não cabiam mais — e escondê-los como sub-abas da Biblioteca
 * era o que fazia o cabeçalho dela mudar de lugar a cada troca.
 *
 * O topo da coluna é área de arrastar a janela (ela é frameless), como a
 * barra de título ao lado.
 */
export function Sidebar({ onSettings, info }: { onSettings: () => void; info: AppInfo | null }): JSX.Element {
  const pagina = useNav((s) => s.pagina)
  const ir = useNav((s) => s.ir)
  const analisando = useAnalysisStore((s) => s.status === 'running')
  const itens = useQueueStore((s) => s.itens)
  const filaRodando = useQueueStore((s) => s.rodando)
  const temEpisodio = useResultsStore((s) => s.results !== null)

  const esperando = itens.filter((i) => i.status === 'esperando').length
  const rodando = analisando || filaRodando

  return (
    <nav
      aria-label="Navegação principal"
      className="sidebar-bg flex h-full w-[228px] shrink-0 flex-col border-r border-border/70"
    >
      <div className="drag flex h-12 shrink-0 items-center gap-2.5 px-5">
        <img src={logoUrl} alt="" className="h-[22px] w-auto" draggable={false} />
        <span className="text-[15px] font-extrabold tracking-tight">
          AnCut <span className="text-primary">HUB</span>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
        <button
          type="button"
          onClick={() => ir('novo')}
          className={cn(
            'mb-3 mt-1 flex h-10 items-center justify-center gap-2 rounded-lg text-[14px] font-semibold transition-all',
            'bg-primary text-primary-foreground shadow-soft hover:brightness-110',
            pagina === 'novo' && 'ring-2 ring-primary/30 ring-offset-2 ring-offset-background'
          )}
        >
          <Plus className="size-[18px]" strokeWidth={2.4} />
          Novo corte
        </button>

        <Item
          icone={ListVideo}
          rotulo="Fila"
          ativo={false}
          onClick={() => ir('novo')}
          selo={
            rodando
              ? { texto: esperando ? `rodando · ${esperando}` : 'rodando', verde: true }
              : esperando
                ? { texto: String(esperando) }
                : undefined
          }
        />

        <p className="mb-1 mt-4 px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
          Acervo
        </p>
        <Item icone={Clapperboard} rotulo="Biblioteca" ativo={pagina === 'biblioteca'} onClick={() => ir('biblioteca')} />
        {temEpisodio && (
          <Item
            icone={ListVideo}
            rotulo="Episódio aberto"
            ativo={pagina === 'episodio'}
            onClick={() => ir('episodio')}
            recuo
          />
        )}
        <Item icone={Users} rotulo="Personagens" ativo={pagina === 'personagens'} onClick={() => ir('personagens')} />
        <Item icone={ScanSearch} rotulo="Procurar cena" ativo={pagina === 'cenas'} onClick={() => ir('cenas')} />
        <Item icone={Star} rotulo="Favoritos" ativo={pagina === 'favoritos'} onClick={() => ir('favoritos')} />

        <div className="flex-1" />

        {/* A placa de video mora aqui, perto das Configuracoes -- no topo ela
            disputava lugar com os avisos de atualizacao. */}
        <DeviceBadge info={info} className="mx-1 mb-1" />
        <Item icone={Settings} rotulo="Configurações" ativo={false} onClick={onSettings} />
      </div>
    </nav>
  )
}

function Item({
  icone: Icone,
  rotulo,
  ativo,
  onClick,
  selo,
  recuo
}: {
  icone: LucideIcon
  rotulo: string
  ativo: boolean
  onClick: () => void
  selo?: { texto: string; verde?: boolean }
  /** Sub-item (o episódio aberto, debaixo da Biblioteca). */
  recuo?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={ativo ? 'page' : undefined}
      className={cn(
        'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] font-medium transition-colors',
        recuo && 'pl-8 text-[13px]',
        ativo
          ? 'bg-surface-hover text-foreground'
          : 'text-muted-foreground hover:bg-surface-hover/60 hover:text-foreground'
      )}
    >
      <Icone className={cn('size-[17px] shrink-0', ativo && 'text-primary', recuo && 'size-[15px]')} />
      <span className="flex-1 truncate">{rotulo}</span>
      {selo && (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
            selo.verde ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
          )}
        >
          {selo.texto}
        </span>
      )}
    </button>
  )
}

export type { Pagina }
