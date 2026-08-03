import { CheckCircle2, Ruler, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { BenchmarkCase } from '@shared/types'

/**
 * "Este episódio está certo" — congela o resultado como gabarito.
 *
 * O reconhecimento é medido comparando versões novas do motor contra
 * episódios cuja resposta certa é conhecida. E quem sabe a resposta certa é
 * quem arrumou o episódio na mão: as remoções e movimentações feitas aqui
 * são exatamente a correção que falta.
 *
 * O congelamento é o ponto: a régua vai pra um banco separado. Uma reanálise
 * apaga as identificações do episódio, e se o gabarito morasse junto ele iria
 * embora com elas.
 */
export function BenchmarkButton({
  episodeId,
  label
}: {
  episodeId: number
  label: string
}): JSX.Element {
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [caso, setCaso] = useState<BenchmarkCase | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async (): Promise<void> => {
    setSalvando(true)
    setErro(null)
    try {
      const r = await window.ancut.results.markBenchmark(episodeId, label)
      if (r) setCaso(r)
      else setErro('Não consegui gravar o gabarito.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const abrir = (): void => {
    setCaso(null)
    setErro(null)
    setAberto(true)
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="gap-1.5"
        title="Marca este episódio como resposta certa, pra medir se o reconhecimento melhora ou piora"
        onClick={abrir}
      >
        <Ruler />
        Gabarito
      </Button>

      <Dialog open={aberto} onOpenChange={(o) => !salvando && setAberto(o)}>
        {aberto && (
          <DialogContent
            title="Marcar como gabarito"
            description={
              caso
                ? 'Guardado. Este episódio agora serve de régua.'
                : 'Congela o estado atual como a identificação correta deste episódio.'
            }
            onClose={salvando ? undefined : () => setAberto(false)}
            footer={
              caso ? (
                <Button variant="primary" onClick={() => setAberto(false)}>
                  Fechar
                </Button>
              ) : (
                <>
                  <Button variant="ghost" disabled={salvando} onClick={() => setAberto(false)}>
                    Cancelar
                  </Button>
                  <Button variant="primary" disabled={salvando} onClick={() => void salvar()}>
                    {salvando ? 'Guardando…' : 'Marcar'}
                  </Button>
                </>
              )
            }
          >
            <div className="space-y-3">
              {!caso && !erro && (
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                  Marque só depois de conferir: o que estiver na tela vira a
                  resposta certa. Toda mudança no reconhecimento passa a ser
                  medida contra os episódios marcados aqui — é assim que dá pra
                  saber se uma versão nova melhorou de fato ou só mudou.
                  <br />
                  <br />
                  Marcar de novo o mesmo episódio atualiza o gabarito.
                </p>
              )}

              {caso && (
                <div className="rounded-lg border border-border bg-surface-hover/50 p-3">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-primary">
                    <CheckCircle2 className="size-4" />
                    {caso.label}
                  </p>
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    {caso.shots} cenas · {caso.truth} identificações guardadas
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {caso.total} {caso.total === 1 ? 'gabarito' : 'gabaritos'} no total.
                  </p>
                </div>
              )}

              {erro && (
                <p className="flex items-start gap-2 text-[12px] leading-relaxed text-destructive">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {erro}
                </p>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
