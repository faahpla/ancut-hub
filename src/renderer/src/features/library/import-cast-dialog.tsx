import { AlertTriangle, Check, Download, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { CastPackInfo, CastPackResult } from '@shared/types'

/**
 * Importar um pacote de personagens: mostra o que ele traz e pergunta a qual
 * anime ligar.
 *
 * A 1.34 importava direto e criava um anime solto no banco — o Levi importou
 * o Black Clover e a análise dele, que resolvia o arquivo pra "Black Clover
 * 2nd Season", nunca olhou os personagens. Agora o pacote fica guardado e se
 * liga na hora da análise, pelo id do AniList (quando o pacote traz) ou pelo
 * TÍTULO escolhido aqui — que vale pra qualquer temporada com esse nome.
 *
 * 11/2026: a pergunta vinha PREENCHIDA com o nome do pacote, e os animes da
 * Biblioteca só apareciam digitando. O Levi confirmou "Avatar Seven Havens"
 * (o nome no PC de quem exportou) e o anime dele se chamava "Avatar - Os
 * Sete Refúgios": nunca ligou. Agora a lista da Biblioteca aparece inteira,
 * o que tem o mesmo nome já vem marcado, e sem nenhum igual a pessoa escolhe.
 */

/** Igual ao `titulo_base` do motor: sem acento, pontuação nem temporada. */
function base(t: string): string {
  return t
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(?:\d+(?:st|nd|rd|th)\s+season|season\s*\d+|s\d{1,2}|part\s*\d+|cour\s*\d+|final\s+season|ii|iii|iv)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
export function ImportCastDialog({
  file,
  sugestoes,
  onClose,
  onDone
}: {
  file: string
  /** Nomes dos animes da Biblioteca, pra escolher sem digitar. */
  sugestoes: string[]
  onClose: () => void
  onDone: (r: CastPackResult) => void
}): JSX.Element {
  const [info, setInfo] = useState<CastPackInfo | null>(null)
  const [titulo, setTitulo] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [importando, setImportando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    void window.ancut.results.castInspect(file).then((r) => {
      if (!vivo) return
      setCarregando(false)
      if (!r || r.erro) {
        setErro(r?.erro || 'Não deu pra ler o pacote.')
        return
      }
      setInfo(r)
      // Já vem marcado só o anime da Biblioteca com o MESMO nome do pacote.
      // Sem nenhum igual, nada vem marcado: a pessoa escolhe.
      const doPacote = new Set([r.title, ...(r.titles ?? [])].map(base))
      setTitulo(sugestoes.find((s) => doPacote.has(base(s))) ?? '')
    })
    return () => {
      vivo = false
    }
  }, [file])

  const importar = async (): Promise<void> => {
    if (!titulo.trim()) return
    setImportando(true)
    try {
      const r = await window.ancut.results.castImport(file, titulo.trim())
      if (!r || r.erro) setErro(r?.erro || 'A importação falhou.')
      else onDone(r)
    } finally {
      setImportando(false)
    }
  }

  const nomeArquivo = file.split(/[\\/]/).pop() ?? file
  const semFoto = info ? info.characters - info.withPhotos : 0

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        title="Importar personagens"
        description={nomeArquivo}
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={importando}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="gap-1.5"
              disabled={!info || !titulo.trim() || importando}
              onClick={() => void importar()}
            >
              {importando ? <Loader2 className="animate-spin" /> : <Download />}
              Importar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-[12.5px]">
          {carregando && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Lendo o pacote…
            </p>
          )}

          {erro && (
            <p className="rounded-md border border-danger/40 bg-danger/[0.08] px-3 py-2 text-danger">
              {erro}
            </p>
          )}

          {info && (
            <>
              <div className="rounded-md border border-border bg-surface-sunken px-3 py-2">
                <p className="font-medium">{info.title}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {info.characters} personagens · {info.withPhotos} com foto · {info.photos} fotos
                  {info.centroids ? ` · ${info.centroids} já com reconhecimento` : ''}
                </p>
                {info.sampleFile && (
                  <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground/80" title={info.sampleFile}>
                    Exportado de: {info.sampleFile}
                  </p>
                )}
              </div>

              {semFoto > 0 && (
                <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/[0.08] px-3 py-2 text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  {semFoto === info.characters
                    ? 'Este pacote não traz nenhuma foto: os personagens só ajudam no Modo Descoberta. Peça pra quem exportou atualizar o AnCut e exportar de novo.'
                    : `${semFoto} personagens vêm sem foto e só ajudam no Modo Descoberta.`}
                </p>
              )}

              <div className="flex flex-col gap-1.5">
                <span className="font-medium">Ligar estes personagens a qual anime da sua Biblioteca?</span>
                <ul className="flex max-h-[220px] flex-col gap-1 overflow-y-auto rounded-md border border-border bg-surface-sunken/60 p-1">
                  {sugestoes.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => setTitulo(s)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left transition-colors',
                          titulo === s ? 'bg-primary/15 font-semibold text-primary' : 'hover:bg-surface-hover'
                        )}
                      >
                        <span className="flex-1 truncate">{s}</span>
                        {titulo === s && <Check className="size-3.5 shrink-0" />}
                      </button>
                    </li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  Ou um que ainda não está na Biblioteca:
                  <input
                    value={sugestoes.includes(titulo) ? '' : titulo}
                    placeholder={info.title}
                    onChange={(e) => setTitulo(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-border bg-surface-sunken px-2 py-1 text-foreground outline-none focus:border-primary/60"
                  />
                </label>
                <span className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Vale pra qualquer temporada com esse nome — “Black Clover” liga também
                  “Black Clover 2nd Season”.
                  {info.hasIds && ' O pacote também traz o número do anime no AniList, que liga sozinho.'}{' '}
                  Nada daqui é apagado: importar só soma.
                </span>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
