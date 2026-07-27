import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PanelProps {
  /** Título dentro da box — nunca um "chip" flutuante na borda. */
  title?: string
  /** Numeração de passo ("1", "2", "3") exibida antes do título. */
  step?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  /**
   * Painel de apoio: menos respiro e título em cinza. Usado nos painéis que
   * não devem competir por atenção com o painel principal da tela.
   */
  compact?: boolean
}

/**
 * O painel do app — equivalente ao QGroupBox da versão Qt, mas com o título
 * integrado à superfície (foi exatamente o ajuste pedido lá).
 */
export function Panel({
  title,
  step,
  action,
  children,
  className,
  compact = false
}: PanelProps): JSX.Element {
  return (
    <section
      className={cn(
        'panel flex flex-col',
        compact ? 'gap-2.5 p-4' : 'gap-4 p-5',
        className
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3">
          <h2
            className={cn(
              'flex items-center gap-2 font-semibold tracking-tight',
              compact ? 'text-[13px] text-muted-foreground' : 'text-[14px] text-foreground'
            )}
          >
            {step && (
              <span
                className={cn(
                  'grid size-[18px] place-items-center rounded-md text-[11px] font-bold',
                  compact
                    ? 'bg-muted/60 text-muted-foreground'
                    : 'bg-primary/15 text-primary'
                )}
              >
                {step}
              </span>
            )}
            {title}
          </h2>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
