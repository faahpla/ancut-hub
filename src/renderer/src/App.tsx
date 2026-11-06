import { useEffect, useRef, useState } from 'react'
import { useAnalysisStore } from '@/stores/analysis-store'
import { useQueueStore } from '@/stores/queue-store'
import { useReforcoStore } from '@/stores/reforco-store'
import { useResultsStore } from '@/stores/results-store'
import { episodeLabel } from '@/lib/utils'
import { ReforcoBadge } from '@/features/results/reforco-badge'
import { Sidebar } from '@/components/layout/sidebar'
import { TitleBar } from '@/components/layout/title-bar'
import { AnalyzeView } from '@/features/analyze/analyze-view'
import { CharactersView } from '@/features/library/characters-view'
import { FavoritesView } from '@/features/library/favorites-view'
import { LibraryView } from '@/features/library/library-view'
import { ScenesView } from '@/features/library/scenes-view'
import { ResultsView } from '@/features/results/results-view'
import { SettingsDialog } from '@/features/settings/settings-dialog'
import { UpdateBadge, UpdateDialogHost } from '@/features/update/update-badge'
import { cn } from '@/lib/utils'
import { useNav } from '@/stores/nav-store'
import type { AnalysisResult, AppInfo, RecentEpisode } from '@shared/types'

export default function App(): JSX.Element {
  const pagina = useNav((s) => s.pagina)
  const ir = useNav((s) => s.ir)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const result = useAnalysisStore((s) => s.result)
  const apply = useAnalysisStore((s) => s.apply)
  const openEpisode = useResultsStore((s) => s.openEpisode)
  const aplicarNaFila = useQueueStore((s) => s.aplicar)
  const filaRodando = useQueueStore((s) => s.rodando)
  const jaAberto = useRef<AnalysisResult | null>(null)

  useEffect(() => {
    void window.ancut.app.info().then(setInfo)
  }, [])

  // A assinatura do stream mora AQUI, e não na aba Analisar.
  //
  // Enquanto morou lá, trocar de aba no meio de uma análise desmontava a aba
  // e cancelava a assinatura: todo evento seguinte se perdia — inclusive o
  // `done`, e aí a análise terminava sem levar ninguém a lugar nenhum. A App
  // nunca desmonta, então o stream sobrevive à navegação.
  useEffect(() => window.ancut.analysis.onEvent(apply), [apply])

  // A fila escuta o MESMO stream, por conta própria. Ela só se interessa
  // pelos eventos terminais (done/failed/cancelled), que é quando precisa
  // mandar o próximo episódio — e assinar separado evita que o store da
  // análise, que cuida de barra de progresso e ETA, precise aprender que
  // existe uma fila.
  useEffect(() => window.ancut.analysis.onEvent(aplicarNaFila), [aplicarNaFila])

  // Análise terminou: abre o resultado em vez de deixar o usuário caçá-lo no
  // histórico. A navegação mora aqui, e não no store da análise, porque é a
  // App que é dona das abas — o store não deveria saber que abas existem.
  //
  // O guard compara a IDENTIDADE do objeto, não o episodeId: reanalisar o
  // mesmo episódio produz um result novo com o mesmo id, e comparar id
  // deixaria de reabrir justamente na reanálise. `begin()` zera o result, então
  // cada execução traz um objeto novo.
  //
  // A troca de aba vem no `finally`: carregar o episódio pode falhar (backend
  // fora do ar, banco travado) e mesmo assim o usuário TEM que sair da tela de
  // progresso. Preso no `then`, uma falha de leitura deixava a análise
  // terminada sem levar ninguém a lugar nenhum.
  //
  // Com a FILA rodando isto não vale: ela termina um episódio a cada poucos
  // minutos, e pular pra Resultados a cada um arrancaria a pessoa de onde
  // ela estivesse, várias vezes seguidas. A fila mostra o que ficou pronto
  // na lista dela, e cada linha tem um "Ver".
  //
  // Fora da fila, é também aqui que o "Reforçar refs ao terminar" do batismo
  // dispara. Dentro dela quem dispara é a fila, que precisa esperar o reforço
  // antes do próximo episódio — `consumirReforco` garante que só um dos dois
  // pega o pedido.
  useEffect(() => {
    if (!result || jaAberto.current === result) return
    jaAberto.current = result
    if (filaRodando) return
    if (useAnalysisStore.getState().consumirReforco()) {
      void useReforcoStore
        .getState()
        .rodar(result.episodeId, `${result.animeTitle} ${episodeLabel(result.season, result.episode, result.kind)}`)
    }
    void openEpisode(result.episodeId, { recarregar: true })
      .catch((e) => console.error('[resultados] falha ao abrir o episódio:', e))
      .finally(() => ir('episodio'))
  }, [result, openEpisode, filaRodando, ir])

  // A tela de batismo mora na aba Analisar. Se ela ficar pronta com a pessoa
  // em outra aba — olhando o resultado do episódio anterior da fila, por
  // exemplo —, o motor fica parado esperando nomes que ninguém está vendo.
  const discoveryPronta = useAnalysisStore((s) => s.discovery !== null)
  useEffect(() => {
    if (discoveryPronta) ir('novo')
  }, [discoveryPronta, ir])

  /**
   * Episódios marcados na Biblioteca vão pra fila em Modo Descoberta.
   *
   * Só manda começar se o motor estiver livre: com uma análise avulsa
   * rodando, começar agora faria o primeiro bater em "já existe uma análise"
   * — eles ficam esperando na fila, com o botão de começar à mão.
   */
  const descobrirEmSequencia = (
    eps: RecentEpisode[],
    modo: 'descobrir' | 'reconhecer' = 'descobrir'
  ): void => {
    const fila = useQueueStore.getState()
    fila.adicionarDescoberta(eps, modo)
    const avulsa = useAnalysisStore.getState().status === 'running' && !fila.rodando
    if (!avulsa) void fila.iniciar()
    ir('novo')
  }

  const abrirEpisodio = (episodeId: number, origem: string): void => {
    // Da fila o episódio acabou de ser analisado: relê, mesmo se estava aberto.
    void openEpisode(episodeId, { recarregar: origem === 'fila' })
      .catch((e) => console.error(`[${origem}] falha ao abrir o episódio:`, e))
      .finally(() => ir('episodio'))
  }

  return (
    // A interface nova (11/2026): menu lateral fixo, e cada coisa uma página.
    // O fundo com os gradientes fica aqui, na raiz — as páginas rolam por cima.
    <div className="app-bg flex h-full text-foreground">
      <Sidebar onSettings={() => setSettingsOpen(true)} info={info} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TitleBar
          actions={
            <>
              <ReforcoBadge />
              <UpdateBadge />
            </>
          }
        />

        <main
          className={cn(
            'flex-1 overflow-y-auto',
            // O episódio é uma bancada de trabalho: usa a tela até a borda.
            pagina === 'episodio' ? 'px-4 pb-4 pt-3' : 'px-8 pb-10 pt-4'
          )}
        >
          {pagina === 'novo' ? (
            <AnalyzeView onVerResultado={(id) => abrirEpisodio(id, 'fila')} />
          ) : pagina === 'biblioteca' ? (
            <LibraryView
              onOpen={(id) => abrirEpisodio(id, 'biblioteca')}
              onDescobrir={descobrirEmSequencia}
            />
          ) : pagina === 'personagens' ? (
            <CharactersView />
          ) : pagina === 'cenas' ? (
            <ScenesView />
          ) : pagina === 'favoritos' ? (
            <FavoritesView />
          ) : (
            <ResultsView onBrowse={() => ir('biblioteca')} onAnalyze={() => ir('novo')} />
          )}
        </main>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} info={info} />
      <UpdateDialogHost />
    </div>
  )
}
