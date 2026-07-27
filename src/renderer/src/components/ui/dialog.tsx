import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root

/**
 * Diálogo modal. Substitui os QMessageBox da versão Qt.
 *
 * A animação é keyframe CSS (via tailwindcss-animate), não JS: se o rAF
 * travar, o conteúdo continua visível — regra da casa, aprendida no Dangai.
 */
export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
  onClose
}: {
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  className?: string
  onClose?: () => void
}): JSX.Element {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[86vh] w-[min(560px,92vw)]',
          // O translate está nas classes E dentro do keyframe `dialog-in`:
          // as classes cobrem o caso sem animação, o keyframe cobre o resto
          // (uma anima `transform` inteiro e apagaria a centralização).
          '-translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden',
          'rounded-xl border border-border bg-surface p-5 shadow-elevated',
          'data-[state=open]:animate-dialog-in',
          className
        )}
      >
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="text-[15px] font-bold tracking-tight">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description asChild>
                <div className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  {description}
                </div>
              </DialogPrimitive.Description>
            )}
          </div>
          {onClose && (
            <DialogPrimitive.Close
              onClick={onClose}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          )}
        </header>

        {children && (
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
        )}

        {footer && <footer className="flex justify-end gap-2">{footer}</footer>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
