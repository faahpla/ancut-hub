import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Três níveis de botão, como definido na spec de design:
 *
 *   primary   — verde, a ação principal (Analisar episódio). Um por tela.
 *   secondary — cinza, ações de apoio (Modo Descoberta, Testar refs).
 *   special   — gradiente indigo→violeta, a ação "premium" (Analisar com IA).
 *
 * O verde é sinal de AÇÃO/SUCESSO. Espalhar verde por botão secundário mata
 * a hierarquia — foi a regra que a versão Qt seguiu e vale aqui também.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'font-semibold transition-all duration-150 select-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0'
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-soft hover:brightness-110 active:brightness-95',
        secondary:
          'bg-surface-hover text-foreground border border-border hover:bg-surface-elevated hover:border-muted',
        special:
          'text-white border-0 shadow-soft bg-[linear-gradient(100deg,hsl(243_75%_59%),hsl(266_85%_58%))] hover:brightness-110',
        ghost: 'bg-transparent text-muted-foreground hover:bg-surface-hover hover:text-foreground',
        danger: 'bg-destructive text-destructive-foreground hover:brightness-110'
      },
      size: {
        sm: 'h-8 px-3 text-[13px] [&_svg]:size-[14px]',
        md: 'h-9 px-4 text-[13px] [&_svg]:size-4',
        lg: 'h-11 px-6 text-[14px] [&_svg]:size-[18px]',
        icon: 'h-9 w-9 p-0 [&_svg]:size-4'
      }
    },
    defaultVariants: { variant: 'secondary', size: 'md' }
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
)
Button.displayName = 'Button'
