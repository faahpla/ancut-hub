import { FolderOpen, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { NeedsInputEvent } from '@shared/types'

/**
 * Pipeline parou e precisa de uma decisão.
 *
 * No Qt eram QMessageBox abertos de dentro do worker; aqui o backend emite
 * um evento e a interface decide. Os dois casos têm a mesma saída prática:
 * o Modo Descoberta, que constrói o banco a partir do próprio episódio.
 */
export function NeedsInputDialog({
  event,
  onDismiss,
  onDiscovery
}: {
  event: (NeedsInputEvent & { refsDir?: string }) | null
  onDismiss: () => void
  onDiscovery: () => void
}): JSX.Element | null {
  if (!event) return null

  const refsMissing = event.kind === 'refs-missing'
  const title = refsMissing
    ? 'Sem referências suficientes'
    : 'Anime não encontrado nas bases online'

  const description = refsMissing
    ? 'Nenhum personagem conseguiu fotos de referência utilizáveis, então não dá pra reconhecer ninguém.'
    : 'A busca na AniList e no MyAnimeList não achou este anime, e não existe banco local pra ele.'

  return (
    <Dialog open onOpenChange={(v) => !v && onDismiss()}>
      <DialogContent
        title={title}
        description={description}
        onClose={onDismiss}
        footer={
          <>
            <Button variant="ghost" onClick={onDismiss}>
              Fechar
            </Button>
            {refsMissing && event.refsDir && (
              <Button
                variant="secondary"
                className="gap-1.5"
                onClick={() => void window.ancut.shell.reveal(event.refsDir as string)}
              >
                <FolderOpen />
                Abrir pasta de refs
              </Button>
            )}
            <Button variant="primary" className="gap-1.5" onClick={onDiscovery}>
              <Wand2 />
              Rodar Modo Descoberta
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-surface-sunken/50 p-3">
            <div className="text-[13px] font-semibold">Modo Descoberta</div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Agrupa os rostos do próprio episódio por semelhança e você dá os
              nomes no fim. Funciona 100% offline e os rostos nomeados viram
              referência pros próximos episódios.
            </p>
          </div>

          {refsMissing && (
            <p className="px-0.5 text-[12px] leading-relaxed text-muted-foreground">
              Ou adicione fotos na mão: cada personagem tem uma subpasta na
              pasta de referências. Umas 3–8 imagens com o rosto bem visível
              por personagem (prints do próprio episódio funcionam ótimo), e
              analise de novo — as cenas já cortadas ficam em cache.
            </p>
          )}

          {event.message && (
            <details className="rounded-md border border-border/70 bg-surface-sunken/40 p-2">
              <summary className="cursor-pointer text-[12px] font-medium text-muted-foreground">
                Mensagem do backend
              </summary>
              <pre className="scrollbar-thin mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                {event.message}
              </pre>
            </details>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
