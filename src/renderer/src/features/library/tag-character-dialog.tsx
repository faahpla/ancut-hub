import { Loader2, Search, Tag, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { CharacterEntry } from '@shared/types'

/**
 * Escolher de quem é a cena.
 *
 * Por que um diálogo com busca e não uma lista dentro do menu do clique
 * direito: o menu já cabe num anime de 4 personagens, mas "Mushoku Tensei"
 * tem dezenas no elenco e a lista viraria uma parede. Aqui dá pra digitar
 * três letras e apertar Enter.
 *
 * A lista é a MESMA da aba Personagem — grafias já unidas, contagem junto.
 * Ver `storage/personagens.py`.
 */
export function TagCharacterDialog({
  anime,
  atuais,
  lista,
  onEscolher,
  onFechar
}: {
  /** Pasta do anime da cena. Só o elenco dele aparece. */
  anime: string
  /** Quem a cena já tem — pra não oferecer duas vezes. */
  atuais: string[]
  /** O índice de personagens do acervo. `null` enquanto carrega. */
  lista: CharacterEntry[] | null
  onEscolher: (c: CharacterEntry) => void
  onFechar: () => void
}): JSX.Element {
  const [busca, setBusca] = useState('')
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // O gesto que abre isto é o clique direito; a mão já está no mouse, mas
    // quem sabe o nome digita — e digitar não pode exigir um clique antes.
    const t = window.setTimeout(() => campo.current?.focus(), 40)
    return () => window.clearTimeout(t)
  }, [])

  const visiveis = useMemo(() => {
    if (!lista) return []
    const doAnime = lista.filter((c) => c.animes.some((a) => a === anime))
    const alvo = busca.trim().toLowerCase()
    if (!alvo) return doAnime
    return doAnime.filter(
      (c) =>
        c.name.toLowerCase().includes(alvo) ||
        c.aliases.some((a) => a.toLowerCase().includes(alvo))
    )
  }, [lista, anime, busca])

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent
        title="Marcar personagem"
        description={
          <>
            De quem é esta cena? A escolha vale no app e cria o clipe em{' '}
            <code className="rounded bg-surface-sunken px-1 text-[11.5px]">by_character/</code>,
            e sobrevive a uma nova análise do episódio.
          </>
        }
        onClose={onFechar}
        footer={
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
        }
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={campo}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              // Enter marca o primeiro da lista: com a busca filtrando, ele é
              // quase sempre o que a pessoa queria.
              if (e.key === 'Enter' && visiveis[0]) onEscolher(visiveis[0])
            }}
            placeholder="Procurar no elenco…"
            className="h-9 w-full rounded-md border border-border bg-surface-sunken pl-8 pr-7 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:border-primary/60"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {!lista ? (
          <div className="grid min-h-[120px] place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : visiveis.length === 0 ? (
          <p className="py-8 text-center text-[12.5px] text-muted-foreground">
            {busca ? `Ninguém com “${busca}” em ${anime}.` : `Nenhum personagem em ${anime}.`}
          </p>
        ) : (
          <ul className="-mx-1 max-h-[46vh] overflow-y-auto px-1">
            {visiveis.map((c) => {
              const ja = atuais.some((n) => n === c.name)
              return (
                <li key={c.name}>
                  <button
                    type="button"
                    disabled={ja}
                    onClick={() => onEscolher(c)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left',
                      ja
                        ? 'cursor-default opacity-40'
                        : 'transition-colors hover:bg-surface-hover'
                    )}
                  >
                    <Tag className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{c.name}</span>
                      {c.aliases.length > 0 && (
                        <span className="block truncate text-[11px] text-muted-foreground/70">
                          também: {c.aliases.join(', ')}
                        </span>
                      )}
                    </span>
                    <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                      {ja ? 'já marcado' : `${c.shots.toLocaleString('pt-BR')} cenas`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
