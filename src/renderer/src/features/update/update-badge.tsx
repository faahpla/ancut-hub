import { ArrowDownToLine, CheckCircle2, Loader2, Sparkles, TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useUpdateStore } from '@/stores/update-store'

/**
 * Aviso de versão nova.
 *
 * Fica no cabeçalho como uma pílula discreta e só aparece quando há algo de
 * fato — atualização não pode competir com o trabalho do usuário, então
 * nada de modal se abrindo sozinho no meio de uma análise.
 */
export function UpdateBadge(): JSX.Element | null {
  const { status, dismissed, setOpen, subscribe } = useUpdateStore()

  useEffect(() => subscribe(), [subscribe])

  const phase = status?.phase
  const visible =
    !dismissed && (phase === 'available' || phase === 'downloading' || phase === 'ready')

  if (!visible) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-drag flex h-7 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 text-[11.5px] font-semibold text-primary transition-colors hover:bg-primary/20"
      >
        {phase === 'downloading' ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : phase === 'ready' ? (
          <CheckCircle2 className="size-3.5" />
        ) : (
          <Sparkles className="size-3.5" />
        )}
        {phase === 'downloading'
          ? 'Baixando…'
          : phase === 'ready'
            ? 'Pronto pra instalar'
            : `Versão ${status?.manifest?.version}`}
      </button>

    </>
  )
}

/**
 * O diálogo mora aqui, montado UMA vez no topo da árvore.
 *
 * Tanto a pílula quanto o botão em Configurações só ligam `open` no store —
 * se cada um montasse o seu, o Radix empilharia dois overlays e a tela
 * escureceria em dobro.
 */
export function UpdateDialogHost(): JSX.Element | null {
  const { open, setOpen, status } = useUpdateStore()
  if (!open || !status?.manifest) return null
  return (
    <Dialog open onOpenChange={setOpen}>
      <UpdateDialog />
    </Dialog>
  )
}

function UpdateDialog(): JSX.Element {
  const { status, setOpen, dismiss, download, apply } = useUpdateStore()
  const manifest = status?.manifest
  const phase = status?.phase ?? 'idle'

  const totalMb = manifest
    ? (manifest.packages.ui.size + (manifest.packages.engine?.size ?? 0)) / 1e6
    : 0
  const pct =
    status?.progress && status.progress.total > 0
      ? Math.round((status.progress.received / status.progress.total) * 100)
      : 0

  return (
    <DialogContent
      title={
        phase === 'ready'
          ? 'Atualização pronta pra instalar'
          : `AnCut HUB ${manifest?.version ?? ''} disponível`
      }
      description={
        phase === 'ready'
          ? 'O app vai fechar, aplicar a atualização e abrir de novo sozinho. O Windows vai pedir permissão uma vez.'
          : `Você está na ${status?.currentVersion}. O download é de ${totalMb.toFixed(1)} MB — só o que mudou, não o pacote inteiro.`
      }
      onClose={() => setOpen(false)}
      footer={
        <>
          <Button variant="ghost" onClick={dismiss}>
            Depois
          </Button>
          {phase === 'ready' ? (
            <Button variant="primary" onClick={() => void apply()}>
              Instalar e reiniciar
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={phase === 'downloading'}
              onClick={() => void download()}
            >
              {phase === 'downloading' ? (
                <>
                  <Loader2 className="animate-spin" />
                  Baixando {pct}%
                </>
              ) : (
                <>
                  <ArrowDownToLine />
                  Baixar atualização
                </>
              )}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {manifest?.notes && (
          <div className="rounded-lg border border-border bg-surface-hover/50 p-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              O que mudou
            </p>
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed">
              {manifest.notes}
            </p>
          </div>
        )}

        {phase === 'downloading' && (
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {status?.error && (
          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            {status.error}
          </p>
        )}

        {manifest?.packages.engine && (
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Esta atualização também troca o motor de análise, por isso é maior
            que o normal.
          </p>
        )}
      </div>
    </DialogContent>
  )
}
