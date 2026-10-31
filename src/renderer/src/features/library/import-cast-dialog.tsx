import { AlertTriangle, Download, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
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
 */
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
      setTitulo(r.title)
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

              <label className="flex flex-col gap-1.5">
                <span className="font-medium">Ligar estes personagens a qual anime?</span>
                <input
                  value={titulo}
                  list="import-cast-titulos"
                  onChange={(e) => setTitulo(e.target.value)}
                  className="rounded-md border border-border bg-surface-sunken px-2 py-1.5 outline-none focus:border-primary/60"
                />
                <datalist id="import-cast-titulos">
                  {sugestoes.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <span className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Vale pra qualquer temporada com esse nome — “Black Clover” liga também
                  “Black Clover 2nd Season”.
                  {info.hasIds && ' O pacote também traz o número do anime no AniList, que liga sozinho.'}{' '}
                  Nada daqui é apagado: importar só soma.
                </span>
              </label>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
