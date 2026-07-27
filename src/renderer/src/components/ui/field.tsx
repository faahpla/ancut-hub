import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Rótulo acima do campo (padrão Raycast), não ao lado. */
export function Field({
  label,
  hint,
  children,
  className
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label className="px-0.5 text-[12px] font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <span className="px-0.5 text-[11px] text-muted-foreground/70">{hint}</span>}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-border bg-surface-sunken px-3',
        'text-[13px] text-foreground placeholder:text-muted-foreground/60',
        'transition-colors outline-none',
        'hover:border-muted focus:border-primary focus:ring-1 focus:ring-primary/40',
        'disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'
