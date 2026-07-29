import { CheckCircle2, Loader2, Sparkles, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { HarvestDone, HarvestProgress } from '@shared/types'

/**
 * "Reforçar refs com este episódio".
 *
 * Colhe os rostos de alta confiança das cenas já identificadas e guarda como
 * referência. Vale mais que arte promocional porque casa com o traço e a luz
 * do próprio anime — cada episódio conferido deixa a próxima análise mais
 * fiel. É só adição: nada no banco de referências é sobrescrito ou apagado.
 */
export function HarvestButton({ episodeId }: { episodeId: number }): JSX.Element {
  const [aberto, setAberto] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [progresso, setProgresso] = useState<HarvestProgress | null>(null)
  const [resultado, setResultado] = useState<HarvestDone | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(
    () =>
      window.ancut.results.onHarvestEvent((e) => {
        if (e.type === 'harvest-progress') setProgresso(e)
        else if (e.type === 'failed') setErro(e.message)
      }),
    []
  )

  const rodar = async (): Promise<void> => {
    setRodando(true)
    setResultado(null)
    setErro(null)
    setProgresso(null)
    try {
      const r = await window.ancut.results.harvest(episodeId)
      if (r) setResultado(r)
      else setErro((atual) => atual ?? 'O reforço não terminou.')
    } finally {
      setRodando(false)
      setProgresso(null)
    }
  }

  const pct =
    progresso && progresso.total > 0
      ? Math.round((progresso.done / progresso.total) * 100)
      : 0

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        className="gap-1.5"
        title="Usa os rostos deste episódio pra melhorar o reconhecimento nas próximas análises"
        onClick={() => setAberto(true)}
      >
        <Sparkles />
        Reforçar refs
      </Button>

      <Dialog open={aberto} onOpenChange={(o) => !rodando && setAberto(o)}>
        {aberto && (
          <DialogContent
            title="Reforçar refs com este episódio"
            description={
              resultado
                ? 'Pronto. As próximas análises deste anime já usam estas referências.'
                : 'Guarda os rostos mais confiáveis deste episódio como referência do personagem.'
            }
            onClose={rodando ? undefined : () => setAberto(false)}
            footer={
              resultado ? (
                <>
                  {resultado.refsDir && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void window.ancut.shell.open(resultado.refsDir as string)
                      }
                    >
                      Abrir pasta de refs
                    </Button>
                  )}
                  <Button variant="primary" onClick={() => setAberto(false)}>
                    Fechar
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    disabled={rodando}
                    onClick={() => setAberto(false)}
                  >
                    Cancelar
                  </Button>
                  <Button variant="primary" disabled={rodando} onClick={() => void rodar()}>
                    {rodando ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Reforçando…
                      </>
                    ) : (
                      'Reforçar'
                    )}
                  </Button>
                </>
              )
            }
          >
            <div className="space-y-3">
              {!rodando && !resultado && !erro && (
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                  Referência tirada do próprio anime vale mais que arte
                  promocional: casa com o traço e a iluminação das cenas. Só
                  adiciona — nada do que já existe é apagado ou trocado.
                </p>
              )}

              {rodando && (
                <>
                  <p className="text-[12.5px] text-muted-foreground">
                    {progresso?.total
                      ? `${progresso.name} · ${progresso.done} de ${progresso.total}`
                      : (progresso?.name ?? 'preparando…')}
                  </p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </>
              )}

              {resultado && (
                <div className="rounded-lg border border-border bg-surface-hover/50 p-3">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-primary">
                    <CheckCircle2 className="size-4" />
                    {resultado.total} referências novas em {resultado.characters}{' '}
                    {resultado.characters === 1 ? 'personagem' : 'personagens'}
                  </p>
                  <ul className="scrollbar-thin mt-2 max-h-40 space-y-0.5 overflow-y-auto">
                    {Object.entries(resultado.added).map(([nome, n]) => (
                      <li
                        key={nome}
                        className="flex justify-between text-[12px] text-muted-foreground"
                      >
                        <span className="truncate">{nome}</span>
                        <span className="tabular shrink-0 pl-3">+{n}</span>
                      </li>
                    ))}
                  </ul>
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
