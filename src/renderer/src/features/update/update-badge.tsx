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
    !dismissed &&
    (phase === 'available' ||
      phase === 'downloading' ||
      phase === 'ready' ||
      phase === 'applying')

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
            : status?.pacotes.ui === false
              ? 'Motor novo'
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

/**
 * O motor novo não serve no motor instalado: as bibliotecas dele (torch,
 * numpy) são de outra versão, e o pacote pequeno por cima quebraria a
 * análise. Acontece com quem instalou o app antes de 09/2026. Uma vez pelo
 * instalador completo, e daí em diante o motor volta a chegar por aqui.
 */
export function AvisoInstaladorCompleto(): JSX.Element {
  // Sem número de versão no nome do arquivo: o instalador completo NÃO sai
  // em toda versão (é justamente o que esta atualização evita), e a 1.30.0
  // mandou a pessoa procurar um "AnCut-HUB-1.30.0-Completo.exe" que nunca
  // existiu. O mais recente é sempre o certo — e o README aponta pra ele.
  return (
    <p className="rounded-md border border-warning/40 bg-warning/[0.08] px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
      <span className="font-medium text-warning">O motor de análise novo não chega por aqui.</span>{' '}
      O seu foi instalado com bibliotecas de outra versão, e trocar só o motor
      quebraria a análise. Baixe o instalador completo mais recente (o arquivo
      que termina em <b>-Completo.exe</b>, no link do README do projeto no
      GitHub), uma vez — depois disso as próximas correções do motor chegam
      pela atualização normal.
    </p>
  )
}

function UpdateDialog(): JSX.Element {
  const { status, setOpen, dismiss, download, apply } = useUpdateStore()
  const manifest = status?.manifest
  const phase = status?.phase ?? 'idle'

  const soMotor = status?.pacotes.ui === false
  const comMotor = Boolean(status?.pacotes.motor)
  // O tamanho do que VAI ser baixado, não do que o manifesto tem: a
  // interface fica de fora numa atualização só de motor, e o motor fica de
  // fora quando não serve aqui.
  const totalMb = manifest
    ? ((status?.pacotes.ui ? manifest.packages.ui.size : 0) +
        (comMotor ? manifest.packages.motor?.size ?? 0 : 0)) /
      1e6
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
          : soMotor
            ? 'Correção do motor de análise disponível'
            : `AnCut HUB ${manifest?.version ?? ''} disponível`
      }
      description={
        phase === 'applying'
          ? 'Confirme o pedido de permissão do Windows que apareceu na tela. Depois disso o app fecha e volta atualizado.'
          : phase === 'ready'
          ? 'O app vai fechar, aplicar a atualização e abrir de novo sozinho. O Windows vai pedir permissão uma vez.'
          : soMotor
          ? `A interface já está na ${status?.currentVersion}; falta o motor. O download é de ${totalMb.toFixed(1)} MB.`
          : `Você está na ${status?.currentVersion}. O download é de ${totalMb.toFixed(1)} MB — só o que mudou, não o pacote inteiro.`
      }
      onClose={() => setOpen(false)}
      footer={
        <>
          <Button variant="ghost" onClick={dismiss}>
            Depois
          </Button>
          {phase === 'ready' || phase === 'applying' ? (
            <Button
              variant="primary"
              disabled={phase === 'applying'}
              onClick={() => void apply()}
            >
              {phase === 'applying' ? (
                <>
                  <Loader2 className="animate-spin" />
                  Aguardando permissão…
                </>
              ) : (
                'Instalar e reiniciar'
              )}
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

        {comMotor && !soMotor && (
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Esta atualização também troca o motor de análise, por isso é maior
            que o normal.
          </p>
        )}

        {status?.motorIncompativel && <AvisoInstaladorCompleto />}
      </div>
    </DialogContent>
  )
}
