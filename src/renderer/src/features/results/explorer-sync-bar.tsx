import { FolderSync, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useResultsStore } from '@/stores/results-store'

/**
 * "Você mexeu na pasta — quer que eu acompanhe?"
 *
 * Apagar clipes no Explorer é curadoria de verdade: ao tirar três vídeos de
 * `by_character/Rimuru/`, o usuário está dizendo que aquelas cenas não são
 * do Rimuru. Antes disso não significar nada, o app continuava mostrando as
 * cenas e a reanálise seguinte recriava os arquivos.
 *
 * A barra existe porque isto é interpretação, não fato. Aplicar sozinho
 * transformaria qualquer mexida — inclusive um recortar/colar no lugar
 * errado — em decisão permanente.
 */
export function ExplorerSyncBar(): JSX.Element | null {
  const { explorer, applyExplorer, dismissExplorer } = useResultsStore()
  const [pastas, setPastas] = useState<number[]>([])
  const [aplicando, setAplicando] = useState(false)

  if (!explorer) return null

  const porPersonagem = new Map<string, number>()
  for (const p of explorer.unlinkedPairs) {
    porPersonagem.set(p.character, (porPersonagem.get(p.character) ?? 0) + 1)
  }

  const aplicar = async (): Promise<void> => {
    setAplicando(true)
    try {
      await applyExplorer(pastas)
    } finally {
      setAplicando(false)
      setPastas([])
    }
  }

  return (
    <div className="shrink-0 rounded-lg border border-primary/30 bg-primary/[0.06] px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <FolderSync className="size-4 shrink-0 text-primary" />
        <span className="flex-1 text-[13px] font-semibold">
          Você mexeu nesta pasta pelo Explorer
        </span>
        <Button size="sm" variant="ghost" onClick={dismissExplorer} title="Ignorar">
          <X />
        </Button>
      </div>

      <ul className="mt-1.5 space-y-0.5 text-[12px] text-muted-foreground">
        {explorer.missingClips > 0 && (
          <li>
            {explorer.missingClips}{' '}
            {explorer.missingClips === 1 ? 'cena sumiu' : 'cenas sumiram'} de
            shots — serão tiradas do episódio.
          </li>
        )}
        {[...porPersonagem].map(([nome, n]) => (
          <li key={nome}>
            {n} {n === 1 ? 'cena saiu' : 'cenas saíram'} da pasta de{' '}
            <span className="font-medium text-foreground">{nome}</span> — vira
            correção lembrada, e a próxima análise não devolve.
          </li>
        ))}
      </ul>

      {/* Pasta inteira sumida é caso à parte: 80 clipes de uma vez pode ser
          decisão ou acidente, e só quem apagou sabe. */}
      {explorer.missingFolders.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
          <p className="text-[12px] text-muted-foreground">
            Estas pastas de personagem sumiram inteiras. Marque as que você
            apagou de propósito:
          </p>
          {explorer.missingFolders.map((f) => (
            <label
              key={f.character}
              className="flex cursor-pointer items-center gap-2 text-[12.5px]"
            >
              <input
                type="checkbox"
                checked={pastas.includes(f.id)}
                onChange={(e) =>
                  setPastas((atual) =>
                    e.target.checked
                      ? [...atual, f.id]
                      : atual.filter((x) => x !== f.id)
                  )
                }
              />
              <span className="font-medium">{f.character}</span>
              <span className="text-muted-foreground">
                ({f.shots} {f.shots === 1 ? 'cena' : 'cenas'})
              </span>
            </label>
          ))}
        </div>
      )}

      {explorer.unreadableFolders.length > 0 && (
        <p className="mt-2 border-t border-border/60 pt-2 text-[11.5px] leading-relaxed text-muted-foreground">
          Não consegui conferir{' '}
          {explorer.unreadableFolders.join(', ')} — os arquivos dessas pastas
          não batem com os do episódio (renomeados ou copiados em vez de
          linkados). Ficaram de fora, nada foi alterado nelas.
        </p>
      )}

      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={dismissExplorer}>
          Agora não
        </Button>
        <Button size="sm" variant="primary" disabled={aplicando} onClick={() => void aplicar()}>
          {aplicando ? 'Aplicando…' : 'Acompanhar as mudanças'}
        </Button>
      </div>
    </div>
  )
}
