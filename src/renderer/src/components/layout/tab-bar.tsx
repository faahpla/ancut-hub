import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export type TabKey = 'analyze' | 'library' | 'results'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'analyze', label: 'Analisar' },
  { key: 'library', label: 'Biblioteca' },
  { key: 'results', label: 'Resultados' }
]

/**
 * Abas em pill. O fundo ativo é um `layoutId` do Framer Motion, então ele
 * desliza entre as abas em vez de piscar.
 *
 * Motion aqui é seguro: o que anima é o FUNDO, não a opacidade do texto — se
 * a animação travar, os rótulos continuam legíveis.
 */
export function TabBar({
  value,
  onChange
}: {
  value: TabKey
  onChange: (key: TabKey) => void
}): JSX.Element {
  return (
    <nav className="no-drag flex items-center gap-1">
      {TABS.map((tab) => {
        const active = tab.key === value
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {active && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-md bg-surface-hover"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
