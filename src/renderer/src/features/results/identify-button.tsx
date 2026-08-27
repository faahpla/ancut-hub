import { AlertTriangle, ScanFace } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAnalysisStore } from '@/stores/analysis-store'
import { useEpisodeStore } from '@/stores/episode-store'
import type { EpisodeResults } from '@shared/types'

/**
 * "Identificar personagens" num episódio que foi só cortado.
 *
 * O uso é o dele: com pressa, aperta **Só cortar** pra ter os clipes na mão
 * em minutos. Depois, sem pressa, quer os personagens — e até agora isso
 * significava voltar à aba Analisar e montar o formulário de novo, na mão,
 * lembrando qual arquivo era.
 *
 * **Por que isto é rápido e não uma segunda análise inteira.** O motor guarda
 * o trabalho caro no disco: os limites das cenas em `shot_bounds.json` e os
 * clipes em `shots/`. Uma análise normal sobre o mesmo arquivo reaproveita os
 * dois — o log até diz "N já em cache". Sobra o que ele quer: baixar as refs,
 * reconhecer e organizar em pastas por personagem.
 *
 * Por isso aqui não existe modo novo no motor. É a análise normal, com o
 * formulário preenchido a partir do que o banco já sabe.
 */
export function IdentifyButton({
  results,
  onStarted
}: {
  results: EpisodeResults
  /** Leva pra tela de progresso — quem manda nas abas é a App. */
  onStarted: () => void
}): JSX.Element | null {
  const begin = useAnalysisStore((s) => s.begin)
  const apply = useAnalysisStore((s) => s.apply)
  const prefs = useEpisodeStore()
  const [confirmar, setConfirmar] = useState(false)

  // Só faz sentido em episódio sem personagem nenhum. Com o elenco já lá, o
  // caminho certo é "Reforçar refs" ou uma reanálise pela aba Analisar.
  if (results.characters.length > 0) return null

  /**
   * A pasta de saída, deduzida da pasta do episódio.
   *
   * `episodeRoot` é `<saída>/<anime>/<S04E17>`, então subir dois níveis dá a
   * raiz. Deduzir daqui, e não ler das configurações, é o que garante que o
   * episódio seja reidentificado ONDE ELE ESTÁ: se a pasta de saída mudou
   * desde o corte, ler das configurações recortaria tudo num lugar novo.
   */
  const outputDir = (): string => {
    const sep = results.episodeRoot.includes('\\') ? '\\' : '/'
    return results.episodeRoot.split(sep).slice(0, -2).join(sep)
  }

  /**
   * @param descoberta Abre a tela de batismo em vez de decidir sozinho.
   *
   * Os dois caminhos existem porque servem a casos diferentes, e o automático
   * decidindo calado era o problema: quando o anime não está catalogado, ou
   * está com o elenco pela metade, ele acerta pouco e não pergunta nada. A
   * descoberta agrupa os rostos e devolve a decisão pra quem sabe quem é.
   */
  const identificar = async (descoberta: boolean): Promise<void> => {
    begin()
    onStarted()
    try {
      await window.ancut.analysis.start({
        videoPath: results.sourceFile,
        anime: results.animeTitle,
        season: results.season,
        episode: results.episode,
        kind: results.kind,
        outputDir: outputDir(),
        // Explícito: a pasta em que o episódio JÁ mora. Deixar o motor
        // decidir de novo poderia mandá-lo pra outra (a memória de pastas
        // muda com o tempo) e o episódio nasceria duplicado.
        outputFolder: results.animeFolder,
        skipHeadSeconds: 0,
        skipTailSeconds: 0,
        params: prefs.params,
        aiReview: false,
        discovery: descoberta,
        cutOnly: false,
        // O corte já existe e é o mesmo: não há nada pra mesclar com nada.
        mergePrevious: false,
        skipCreditShots: prefs.skipCreditShots,
        useDanbooru: prefs.useDanbooru,
        // O formato do DISCO, não o da tela. É isto que preserva o cache do
        // corte — ver `cutExportMode` em EpisodeResults.
        renderExportMode: results.cutExportMode
      })
    } catch (e) {
      apply({
        type: 'failed',
        message: e instanceof Error ? e.message : 'Falha ao iniciar a identificação.'
      })
    }
  }

  const semVideo = !results.sourceExists

  return (
    <>
      <Button
        size="sm"
        variant="primary"
        className="gap-1.5"
        onClick={() => setConfirmar(true)}
        title={
          semVideo
            ? 'O vídeo original não está mais no lugar'
            : 'Reconhecer os personagens reaproveitando os clipes já cortados'
        }
      >
        <ScanFace />
        Identificar personagens
      </Button>

      <Dialog open={confirmar} onOpenChange={() => setConfirmar(false)}>
        <DialogContent
          title="Identificar os personagens deste episódio?"
          description="As cenas já cortadas são reaproveitadas — não é um corte novo."
          onClose={() => setConfirmar(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmar(false)}>
                Cancelar
              </Button>
              <Button
                variant="secondary"
                disabled={semVideo}
                title="Reconhece sozinho, usando o elenco do anime"
                onClick={() => {
                  setConfirmar(false)
                  void identificar(false)
                }}
              >
                Automático
              </Button>
              <Button
                variant="primary"
                disabled={semVideo}
                title="Agrupa os rostos e abre a tela pra você dar os nomes"
                onClick={() => {
                  setConfirmar(false)
                  void identificar(true)
                }}
              >
                Modo descoberta
              </Button>
            </>
          }
        >
          {!semVideo && (
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[12.5px] leading-relaxed text-muted-foreground">
              <li>
                <strong className="font-semibold text-foreground">Automático</strong> —
                busca o elenco do anime e decide sozinho. Bom quando o anime é
                conhecido e o elenco vem completo.
              </li>
              <li>
                <strong className="font-semibold text-foreground">Modo descoberta</strong>{' '}
                — agrupa os rostos parecidos e abre a tela pra você dar os nomes. É o
                caminho quando o automático erra, ou quando o anime não está
                catalogado.
              </li>
            </ul>
          )}
          {semVideo ? (
            <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/[0.08] px-3 py-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="text-[12.5px] leading-relaxed">
                <p className="font-semibold text-warning">
                  O vídeo original não está mais no lugar.
                </p>
                <p className="mt-1 text-muted-foreground">
                  {results.sourceFile || '(caminho não gravado)'}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Os rostos são procurados nos quadros do episódio, então sem o
                  arquivo não há o que reconhecer. Devolva ele pra esse caminho,
                  ou refaça pela aba Analisar apontando onde ele está agora.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
              <p>
                Os {results.totalShots} clipes e os limites das cenas já estão no
                disco e são reaproveitados. O que roda agora é a parte que
                faltou: buscar o elenco, reconhecer quem aparece em cada cena e
                organizar as pastas por personagem.
              </p>
              <p>
                O episódio continua na pasta{' '}
                <span className="font-medium text-foreground">
                  {results.animeFolder}
                </span>
                . Nada é movido.
              </p>
              <p className="text-[11.5px]">
                Modo de reconhecimento: o mesmo que está escolhido na aba
                Analisar.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
