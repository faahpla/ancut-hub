import { cn } from '@/lib/utils'

/**
 * Anel de progresso. A animação é uma transição CSS no `stroke-dashoffset` —
 * nada de JS por frame, então ele continua correto mesmo se a aba estiver
 * em segundo plano ou o rAF for estrangulado.
 */
export function ProgressRing({
  value,
  size = 132,
  stroke = 9,
  label,
  sublabel,
  tone = 'primary'
}: {
  /** 0..1 */
  value: number
  size?: number
  stroke?: number
  label: string
  sublabel?: string
  tone?: 'primary' | 'muted' | 'destructive'
}): JSX.Element {
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, value))
  const offset = circumference * (1 - clamped)

  const strokeColor =
    tone === 'destructive'
      ? 'stroke-destructive'
      : tone === 'muted'
        ? 'stroke-muted-foreground'
        : 'stroke-primary'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted/50"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(strokeColor, 'transition-[stroke-dashoffset] duration-500 ease-out')}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-[26px] font-bold leading-none tracking-tight">
          {label}
        </span>
        {sublabel && (
          <span className="mt-1 text-[11px] font-medium text-muted-foreground">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  )
}
