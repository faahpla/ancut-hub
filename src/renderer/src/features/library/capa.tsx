import { Clapperboard } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/** Imagem de capa com o quadro neutro de reserva (episódio sem capa). */
export function Capa({ url, className }: { url?: string; className?: string }): JSX.Element {
  const [quebrou, setQuebrou] = useState(false)
  return (
    <span className={cn('relative block overflow-hidden bg-surface-sunken', className)}>
      {url && !quebrou ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setQuebrou(true)}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <span className="grid size-full place-items-center">
          <Clapperboard className="size-6 text-muted-foreground/40" />
        </span>
      )}
    </span>
  )
}

/** A barrinha de quanto do título já tem personagem marcado. */
export function Cobertura({ marcadas, cenas }: { marcadas: number; cenas: number }): JSX.Element {
  const pct = cenas ? Math.round((marcadas / cenas) * 100) : 0
  return (
    <span className="flex items-center gap-2">
      <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-muted/70">
        <span
          className={cn('block h-full rounded-full', pct >= 60 ? 'bg-primary' : 'bg-warning')}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="shrink-0 text-[11.5px] text-muted-foreground">
        {marcadas ? `${pct}% com personagem` : 'sem personagem marcado'}
      </span>
    </span>
  )
}

/** Rosto redondo do personagem, com a inicial de reserva. */
export function Rosto({ url, nome, tamanho = 40 }: { url?: string; nome: string; tamanho?: number }): JSX.Element {
  const [quebrou, setQuebrou] = useState(false)
  return url && !quebrou ? (
    <img
      src={url}
      alt=""
      draggable={false}
      onError={() => setQuebrou(true)}
      style={{ width: tamanho, height: tamanho }}
      className="shrink-0 rounded-full border border-border/70 object-cover"
    />
  ) : (
    <span
      style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.4 }}
      className="grid shrink-0 place-items-center rounded-full bg-muted font-semibold text-muted-foreground"
    >
      {nome.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
