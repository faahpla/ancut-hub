import { Settings } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAnalysisStore } from '@/stores/analysis-store'
import { useResultsStore } from '@/stores/results-store'
import { Brand } from '@/components/layout/brand'
import { DeviceBadge } from '@/components/layout/device-badge'
import { TabBar, type TabKey } from '@/components/layout/tab-bar'
import { TitleBar } from '@/components/layout/title-bar'
import { Button } from '@/components/ui/button'
import { AnalyzeView } from '@/features/analyze/analyze-view'
import { LibraryView } from '@/features/library/library-view'
import { ResultsView } from '@/features/results/results-view'
import { SettingsDialog } from '@/features/settings/settings-dialog'
import { UpdateBadge, UpdateDialogHost } from '@/features/update/update-badge'
import type { AnalysisResult, AppInfo } from '@shared/types'

export default function App(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('analyze')
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const result = useAnalysisStore((s) => s.result)
  const apply = useAnalysisStore((s) => s.apply)
  const openEpisode = useResultsStore((s) => s.openEpisode)
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
  useEffect(() => {
    if (!result || jaAberto.current === result) return
    jaAberto.current = result
    void openEpisode(result.episodeId)
      .catch((e) => console.error('[resultados] falha ao abrir o episódio:', e))
      .finally(() => setTab('results'))
  }, [result, openEpisode])

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <TitleBar>
        <Brand />
        <TabBar value={tab} onChange={setTab} />
      </TitleBar>

      <div className="no-drag flex items-center justify-end gap-2 px-4 pb-2">
        <UpdateBadge />
        <DeviceBadge gpuName={info?.gpuName ?? null} />
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings />
          Configurações
        </Button>
      </div>

      <main className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-4">
        {tab === 'analyze' ? (
          <AnalyzeView />
        ) : tab === 'library' ? (
          // A Biblioteca escolhe; a aba Resultados trabalha. Abrir daqui leva
          // pra lá porque o episódio aberto ocupa a tela inteira — mostrá-lo
          // dentro da árvore empurraria a árvore pra fora do alcance.
          <LibraryView
            onOpen={(episodeId) => {
              void openEpisode(episodeId)
                .catch((e) => console.error('[biblioteca] falha ao abrir:', e))
                .finally(() => setTab('results'))
            }}
          />
        ) : (
          <ResultsView
            onBrowse={() => setTab('library')}
            onAnalyze={() => setTab('analyze')}
          />
        )}
      </main>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} info={info} />
      <UpdateDialogHost />
    </div>
  )
}
