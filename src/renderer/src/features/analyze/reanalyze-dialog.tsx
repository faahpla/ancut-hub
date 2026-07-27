import { Layers, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'

export type ReanalyzeChoice = 'replace' | 'merge' | 'cancel'

/**
 * Reanálise de um episódio que já tem resultado.
 *
 * Sem esta pergunta, rodar de novo apagaria em silêncio o que a análise
 * anterior identificou. A curadoria manual (remover / mover / aprovar)
 * sobrevive nas duas opções — o que muda é o destino dos acertos antigos.
 */
export function ReanalyzeDialog({
  open,
  onChoose
}: {
  open: boolean
  onChoose: (choice: ReanalyzeChoice) => void
}): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onChoose('cancel')}>
      <DialogContent
        title="Este episódio já foi analisado"
        description="Como aplicar o resultado novo?"
        onClose={() => onChoose('cancel')}
        footer={
          <>
            <Button variant="ghost" onClick={() => onChoose('cancel')}>
              Cancelar
            </Button>
            <Button variant="secondary" className="gap-1.5" onClick={() => onChoose('merge')}>
              <Layers />
              Adicionar por cima
            </Button>
            <Button variant="primary" className="gap-1.5" onClick={() => onChoose('replace')}>
              <RefreshCw />
              Substituir
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2.5">
          <Option
            title="Substituir (recomendado)"
            body="As pastas passam a refletir só a análise nova. Chutes errados da anterior somem — é o que você quer depois de reforçar as referências."
          />
          <Option
            title="Adicionar por cima"
            body="Mantém tudo que já tinha sido identificado e soma o novo. Nada se perde, mas os erros antigos continuam lá até você remover na mão."
          />
          <p className="px-0.5 text-[12px] text-muted-foreground">
            Sua curadoria manual é respeitada nas duas opções.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Option({ title, body }: { title: string; body: string }): JSX.Element {
  return (
    <div className="rounded-md border border-border bg-surface-sunken/50 p-3">
      <div className="text-[13px] font-semibold">{title}</div>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}
