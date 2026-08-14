import { AlertTriangle, ArrowRight, Combine, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { AnimeMergePlan } from '@shared/types'
import type { Anime } from './group-episodes'

/**
 * Juntar duas pastas de anime, em dois tempos.
 *
 * Existe porque nenhuma regra automática dá conta. O programa junta sozinho
 * quando reconhece a identidade do anime, mas "Re Zero" e "Re Zero kara
 * Hajimeru Isekai Seikatsu" só viram a mesma coisa DEPOIS que a fonte
 * responde — e até lá a pasta já precisou existir. Quando escapa, isto aqui é
 * o conserto, sem precisar de mim.
 *
 * O plano vem antes da ação de propósito: mover centenas de clipes sem a
 * pessoa ter visto a lista seria decidir por ela.
 */
export function MergeAnimeDialog({
  origem,
  animes,
  onClose,
  onDone
}: {
  /** Anime que vai deixar de existir (o que estava selecionado). */
  origem: Anime
  /** Todos, pra escolher o destino. */
  animes: Anime[]
  onClose: () => void
  onDone: () => void
}): JSX.Element {
  const [destino, setDestino] = useState<string>('')
  const [plano, setPlano] = useState<AnimeMergePlan | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  const opcoes = animes.filter((a) => a.pasta !== origem.pasta)

  // Cada troca de destino refaz o plano: os conflitos dependem do par, e um
  // plano velho na tela é pior que nenhum.
  useEffect(() => {
    if (!destino) return setPlano(null)
    let vivo = true
    setCarregando(true)
    void window.ancut.results
      .mergeAnimePlan(origem.nome, destino)
      .then((p) => vivo && setPlano(p))
      .finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [destino, origem.nome])

  const aplicar = async (): Promise<void> => {
    if (!plano?.pode) return
    setAplicando(true)
    try {
      const r = await window.ancut.results.mergeAnimeApply(origem.nome, destino)
      if (r?.aplicado) onDone()
      else setPlano(r)
    } finally {
      setAplicando(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        title="Juntar em uma pasta só"
        description={`Os episódios de "${origem.nome}" passam pra pasta escolhida.`}
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
              {aplicando ? <Loader2 className="animate-spin" /> : <Combine />}
              {plano?.pode ? `Mover ${plano.mover.length} episódios` : 'Juntar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[12.5px]">
            <span className="truncate rounded-md border border-border bg-surface-sunken px-2 py-1 font-medium">
              {origem.nome}
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            <select
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border bg-surface-sunken px-2 py-1 outline-none focus:border-primary/60"
            >
              <option value="">Escolha a pasta que fica…</option>
              {opcoes.map((a) => (
                <option key={a.pasta} value={a.nome}>
                  {a.nome} ({a.episodios})
                </option>
              ))}
            </select>
          </div>

          {carregando && (
            <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Conferindo…
            </p>
          )}

          {plano?.erro && (
            <p className="rounded-md border border-danger/40 bg-danger/[0.08] px-3 py-2 text-[12.5px] text-danger">
              {plano.erro}
            </p>
          )}

          {plano && plano.conflitos.length > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/[0.08] px-3 py-2">
              <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-warning">
                <AlertTriangle className="size-3.5" />
                {plano.conflitos.length === 1
                  ? 'Um episódio existe dos dois lados'
                  : `${plano.conflitos.length} episódios existem dos dois lados`}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                {plano.conflitos.join(', ')} — são pastas diferentes com o mesmo
                nome. Escolher qual sobrevive não é decisão do programa: renomeie
                uma delas no Explorer e tente de novo. Nada foi movido.
              </p>
            </div>
          )}

          {plano?.pode && (
            <div className="rounded-md border border-border bg-surface-sunken px-3 py-2">
              <p className="text-[12.5px] font-medium">
                {plano.mover.length} episódios mudam de pasta
              </p>
              <p
                className={cn(
                  'mt-1 max-h-24 overflow-y-auto text-[11.5px] leading-relaxed',
                  'scrollbar-thin text-muted-foreground'
                )}
              >
                {plano.mover.join(', ')}
              </p>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
                Os arquivos são movidos, não copiados — é instantâneo e não
                ocupa espaço novo. O histórico ({plano.linhas}{' '}
                {plano.linhas === 1 ? 'episódio' : 'episódios'}) acompanha, e o
                nome antigo passa a apontar pra pasta que fica, pra próxima
                análise não recriar a que sumiu.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
