import { AlertTriangle, ArrowRight, Film, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { ToBrollPlan } from '@shared/types'

/**
 * Passar episódios já cortados pra B-roll.
 *
 * É o conserto do "jeito antigo": antes do B-roll existir, trailer era
 * cortado como episódio, e os do Cyberpunk 2077 viraram S01E01…S01E05 sem
 * dizer qual era qual. Aqui cada um vira "B-roll 01 - Título", com o título
 * tirado do nome do arquivo de origem.
 *
 * Renomeia pasta no disco, então o plano vem antes — igual a mudar a
 * temporada.
 */
export function ToBrollDialog({
  episodeIds,
  rotulo,
  onClose,
  onDone
}: {
  episodeIds: number[]
  rotulo: string
  onClose: () => void
  onDone: () => void
}): JSX.Element {
  const [plano, setPlano] = useState<ToBrollPlan | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aplicando, setAplicando] = useState(false)

  useEffect(() => {
    let vivo = true
    void window.ancut.results
      .toBrollPlan(episodeIds)
      .then((p) => vivo && setPlano(p))
      .finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [episodeIds])

  const aplicar = async (): Promise<void> => {
    if (!plano?.pode) return
    setAplicando(true)
    try {
      const r = await window.ancut.results.toBrollApply(episodeIds)
      if (r?.aplicado) onDone()
      else setPlano(r)
    } finally {
      setAplicando(false)
    }
  }

  const n = plano?.mudancas.length ?? 0

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        title="Passar pra B-roll"
        description={`${rotulo} — cada um vira "B-roll NN - título", e a pasta é renomeada no disco.`}
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={aplicando}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="gap-1.5"
              disabled={!plano?.pode || aplicando}
              onClick={() => void aplicar()}
            >
              {aplicando ? <Loader2 className="animate-spin" /> : <Film />}
              {plano?.pode ? `Passar ${n} ${n === 1 ? 'vídeo' : 'vídeos'}` : 'Passar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {carregando && (
            <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Conferindo…
            </p>
          )}

          {!carregando && !plano && (
            <p className="text-[12.5px] text-danger">O motor não respondeu — tente de novo.</p>
          )}

          {plano?.erro && (
            <p className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-[12.5px] text-muted-foreground">
              {plano.erro}
            </p>
          )}

          {plano && plano.conflitos.length > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/[0.08] px-3 py-2">
              <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-warning">
                <AlertTriangle className="size-3.5" />
                O destino já está ocupado
              </p>
              <ul className="mt-1 flex flex-col gap-0.5 text-[12px] leading-relaxed text-muted-foreground">
                {plano.conflitos.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {plano && n > 0 && (
            <ul className="flex max-h-[320px] flex-col gap-1 overflow-y-auto">
              {plano.mudancas.map((m) => (
                <li
                  key={m.episodeId}
                  className="flex items-center gap-2 rounded-md border border-border bg-surface-sunken/60 px-2.5 py-1.5 text-[12.5px]"
                >
                  <span className="shrink-0 font-medium text-muted-foreground">{m.de}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium" title={m.para}>
                    {m.para}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
