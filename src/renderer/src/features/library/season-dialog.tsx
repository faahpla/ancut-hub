import { AlertTriangle, ArrowRight, Loader2, Move } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { SeasonPlan } from '@shared/types'

/**
 * Mudar a temporada de episódios já analisados.
 *
 * A numeração vem do nome do arquivo, e ela discorda do mundo o tempo todo:
 * o Bleach: Thousand-Year Blood War é a 17ª temporada do Bleach, mas os
 * arquivos vêm como S01. Isso só se descobre depois de analisar.
 *
 * A temporada não é só um rótulo — ela forma o nome da pasta (`S01E44` →
 * `S17E44`), então isto RENOMEIA pasta no disco. Por isso o plano vem antes:
 * a pessoa vê exatamente o que vira o que, e conflito para tudo em vez de
 * sobrescrever um episódio de verdade.
 */
export function SeasonDialog({
  episodeIds,
  rotulo,
  temporadaAtual,
  temporadaDestino,
  onClose,
  onDone
}: {
  episodeIds: number[]
  /** Descreve o que está sendo movido, pra o título fazer sentido. */
  rotulo: string
  temporadaAtual: number
  /** Quando vem de arrasto: onde ele soltou. Já vira o valor do campo. */
  temporadaDestino?: number
  onClose: () => void
  onDone: () => void
}): JSX.Element {
  // Arrastou = já disse o destino com o mouse; o campo abre preenchido e o
  // plano aparece na hora. Pelo botão, abre na temporada atual pra ele
  // digitar.
  const [alvo, setAlvo] = useState<string>(
    String(temporadaDestino ?? temporadaAtual)
  )
  const [plano, setPlano] = useState<SeasonPlan | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  const numero = Number(alvo)
  const valido = Number.isInteger(numero) && numero >= 1 && numero <= 99

  useEffect(() => {
    if (!valido || numero === temporadaAtual) return setPlano(null)
    let vivo = true
    setCarregando(true)
    // Debounce curto: ele digita "17" e não faz sentido pedir o plano do "1"
    // no caminho.
    const t = window.setTimeout(() => {
      void window.ancut.results
        .setSeasonPlan(episodeIds, numero)
        .then((p) => vivo && setPlano(p))
        .finally(() => vivo && setCarregando(false))
    }, 250)
    return () => {
      vivo = false
      window.clearTimeout(t)
      setCarregando(false)
    }
  }, [alvo, numero, valido, temporadaAtual, episodeIds])

  const aplicar = async (): Promise<void> => {
    if (!plano?.pode) return
    setAplicando(true)
    try {
      const r = await window.ancut.results.setSeasonApply(episodeIds, numero)
      if (r?.aplicado) onDone()
      else setPlano(r)
    } finally {
      setAplicando(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        title="Mudar a temporada"
        description={`${rotulo} — a pasta de cada episódio é renomeada no disco.`}
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
              {aplicando ? <Loader2 className="animate-spin" /> : <Move />}
              {plano?.pode
                ? `Mover ${plano.mudancas.length} ${plano.mudancas.length === 1 ? 'episódio' : 'episódios'}`
                : 'Mover'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[12.5px]">
            <span className="rounded-md border border-border bg-surface-sunken px-2 py-1 font-medium">
              Temporada {temporadaAtual}
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            <label className="flex items-center gap-2">
              Temporada
              <input
                type="number"
                min={1}
                max={99}
                value={alvo}
                autoFocus
                onChange={(e) => setAlvo(e.target.value)}
                className="tabular w-20 rounded-md border border-border bg-surface-sunken px-2 py-1 outline-none focus:border-primary/60"
              />
            </label>
          </div>

          {!valido && alvo !== '' && (
            <p className="text-[12px] text-danger">
              A temporada tem que ser um número de 1 a 99.
            </p>
          )}

          {carregando && (
            <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Conferindo…
            </p>
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
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                Nada foi renomeado. Escolha outra temporada, ou resolva o
                episódio que já está lá primeiro.
              </p>
            </div>
          )}

          {plano?.pode && (
            <div className="rounded-md border border-border bg-surface-sunken px-3 py-2">
              <ul className="tabular scrollbar-thin flex max-h-40 flex-col gap-0.5 overflow-y-auto text-[12px]">
                {plano.mudancas.map((m) => (
                  <li key={m.episodeId} className="flex items-center gap-2">
                    <span className="text-muted-foreground">{m.de}</span>
                    <ArrowRight className="size-3 text-muted-foreground/60" />
                    <span className="font-medium">{m.para}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
                As pastas são renomeadas no disco e o histórico acompanha. Os
                clipes não são tocados — nada é recortado nem copiado.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
