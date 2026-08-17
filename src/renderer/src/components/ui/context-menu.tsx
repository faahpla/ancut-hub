import type { LucideIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export interface ContextMenuItem {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

/**
 * Menu de clique direito.
 *
 * Feito na mão em vez de trazer o `@radix-ui/react-context-menu`: o pacote
 * embrulha CADA item da lista num componente com estado próprio, e a grade
 * aqui passa de 400 cartões — o custo apareceria na rolagem. Aqui só existe
 * um menu, criado no clique e destruído no fechamento.
 */
export function ContextMenu({
  x,
  y,
  items,
  onClose
}: {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Depois de montado dá pra medir: perto da borda o menu é puxado pra dentro,
  // senão metade dele nasce fora da janela e não dá pra clicar.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      x: Math.min(x, window.innerWidth - width - 8),
      y: Math.min(y, window.innerHeight - height - 8)
    })
  }, [x, y])

  useEffect(() => {
    /**
     * Fecha ao clicar FORA. O "fora" não é detalhe: é o que faz o menu
     * funcionar.
     *
     * Antes isto fechava em qualquer `mousedown`, inclusive nos próprios
     * itens. Como a seleção acontece no `mouseup` (o botão direito não
     * dispara `click` no Chromium), a sequência era: mousedown fecha o menu →
     * o React desmonta o botão → o mouseup cai no vazio. Nenhum item
     * funcionava, em menu nenhum do app, e sem erro no console: clicar
     * simplesmente não fazia nada.
     */
    const fechar = (e: Event): void => {
      const alvo = e.target
      if (alvo instanceof Node && ref.current?.contains(alvo)) return
      onClose()
    }
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    // `capture` no mousedown pra fechar ANTES de o clique virar seleção de
    // cena lá embaixo. A rolagem também fecha: o menu é posicionado em
    // coordenadas de tela e ficaria apontando pro cartão errado.
    window.addEventListener('mousedown', fechar, true)
    // Rolagem e resize fecham sempre: o menu é posicionado em coordenadas de
    // tela e ficaria apontando pro item errado.
    const fecharSempre = (): void => onClose()
    window.addEventListener('resize', fecharSempre)
    window.addEventListener('scroll', fecharSempre, true)
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('mousedown', fechar, true)
      window.removeEventListener('resize', fecharSempre)
      window.removeEventListener('scroll', fecharSempre, true)
      window.removeEventListener('keydown', tecla)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
      // Sem animação de entrada: menu de contexto tem que estar sob o cursor
      // no instante do clique, e 0,4s de fade aqui vira sensação de travada.
      className="fixed z-[60] min-w-[190px] overflow-hidden rounded-lg border border-border bg-surface-elevated py-1 shadow-elevated"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          // `mouseup` e não `click`: o `mousedown` que abre o menu é o mesmo
          // gesto, e o botão direito não dispara `click` no Chromium.
          onMouseUp={() => {
            onClose()
            item.onSelect()
          }}
          className={cn(
            'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] transition-colors',
            item.disabled
              ? 'cursor-default text-muted-foreground/40'
              : item.danger
                ? 'text-destructive hover:bg-destructive/10'
                : 'text-foreground hover:bg-surface-hover'
          )}
        >
          {item.icon && <item.icon className="size-3.5 shrink-0" />}
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  )
}
