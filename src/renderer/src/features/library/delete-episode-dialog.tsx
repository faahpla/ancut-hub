import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { EpisodeDeletePlan } from '@shared/types'

function gb(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} bytes`
}

/**
 * Excluir um episódio: sai do histórico e a pasta é apagada DE VEZ.
 *
 * A primeira versão mandava pra Lixeira do Windows. Levantei que era mais
 * seguro e o FAAH preferiu direto — é o acervo dele, e ele decidiu com o
 * tamanho na frente.
 *
 * Justamente por não haver volta, o diálogo mostra o peso ANTES do clique. Um
 * episódio são 1 a 4 GB de clipes, e "excluir" numa lista costuma dar a
 * impressão de tirar uma linha de tabela.
 */
export function DeleteEpisodeDialog({
  episodeId,
  rotulo,
  onClose,
  onDone
}: {
  episodeId: number
  rotulo: string
  onClose: () => void
  onDone: () => void
}): JSX.Element {
  const [plano, setPlano] = useState<EpisodeDeletePlan | null>(null)
  const [apagando, setApagando] = useState(false)
  const [falha, setFalha] = useState('')

  useEffect(() => {
    let vivo = true
    void window.ancut.results
      .deleteEpisodePlan(episodeId)
      .then((p) => vivo && setPlano(p))
    return () => {
      vivo = false
    }
  }, [episodeId])

  const excluir = async (): Promise<void> => {
    setApagando(true)
    setFalha('')
    try {
      const r = await window.ancut.results.deleteEpisodeApply(episodeId)
      if (r?.aplicado) onDone()
      else setFalha(r?.erro || 'não consegui excluir.')
    } finally {
      setApagando(false)
    }
  }

  const impedido = Boolean(plano?.erro) || (plano ? !plano.insideOutput && plano.rootExists : false)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        title={`Excluir ${rotulo}?`}
        description="A pasta é apagada do disco e o episódio sai do histórico."
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={apagando}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              className="gap-1.5"
              disabled={!plano || impedido || apagando}
              onClick={() => void excluir()}
            >
              {apagando ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Excluir
            </Button>
          </>
        }
      >
        {!plano ? (
          <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Conferindo o que seria apagado…
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-[12.5px]">
              <p className="font-medium">
                {plano.shots} {plano.shots === 1 ? 'cena' : 'cenas'}
                {plano.rootExists && ` · ${gb(plano.bytes)} no disco`}
              </p>
              <p className="mt-1 break-all text-[11.5px] text-muted-foreground">
                {plano.root}
              </p>
            </div>

            {!plano.rootExists && (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                A pasta já não está no disco — só a entrada do histórico será
                removida.
              </p>
            )}

            {impedido ? (
              <div className="flex gap-2 rounded-md border border-danger/40 bg-danger/[0.08] px-3 py-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
                <p className="text-[12.5px] leading-relaxed text-danger">
                  {plano.erro || 'a pasta está fora da pasta de saída configurada'}
                  . Sem lixeira pra desfazer, esta trava é a única rede: eu não
                  apago nada que esteja fora do acervo que o app administra.
                  Apague pelo Explorer se for isso mesmo que você quer.
                </p>
              </div>
            ) : (
              <div className="flex gap-2 rounded-md border border-danger/40 bg-danger/[0.08] px-3 py-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
                <p className="text-[12.5px] leading-relaxed">
                  <span className="font-semibold text-danger">
                    Não vai pra Lixeira e não tem como desfazer.
                  </span>{' '}
                  <span className="text-muted-foreground">
                    O vídeo original não é tocado — dá pra analisar de novo, mas
                    é recortar tudo outra vez.
                  </span>
                </p>
              </div>
            )}

            {falha && (
              <p className="rounded-md border border-danger/40 bg-danger/[0.08] px-3 py-2 text-[12.5px] text-danger">
                {falha}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
