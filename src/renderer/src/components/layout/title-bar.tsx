import { Copy, Minus, Square, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Barra de título própria (a janela é frameless).
 *
 * A faixa inteira é área de arrasto (`.drag`); os botões precisam sair dessa
 * área com `.no-drag`, senão viram alça de mover a janela e nunca recebem o
 * clique.
 */
export function TitleBar({ children }: { children?: React.ReactNode }): JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => window.ancut.window.onMaximizedChanged(setMaximized), [])

  return (
    <div className="drag flex h-10 shrink-0 items-center justify-between pl-4">
      <div className="flex min-w-0 items-center gap-3">{children}</div>

      <div className="no-drag flex h-full items-stretch">
        <TitleButton onClick={() => window.ancut.window.minimize()} label="Minimizar">
          <Minus className="size-4" />
        </TitleButton>
        <TitleButton
          onClick={() => window.ancut.window.maximizeToggle()}
          label={maximized ? 'Restaurar' : 'Maximizar'}
        >
          {maximized ? <Copy className="size-[13px] -scale-x-100" /> : <Square className="size-[13px]" />}
        </TitleButton>
        <TitleButton
          onClick={() => window.ancut.window.close()}
          label="Fechar"
          className="hover:bg-destructive hover:text-destructive-foreground"
        >
          <X className="size-4" />
        </TitleButton>
      </div>
    </div>
  )
}

function TitleButton({
  children,
  onClick,
  label,
  className
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  className?: string
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid w-12 place-items-center text-muted-foreground transition-colors',
        'hover:bg-surface-hover hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  )
}
