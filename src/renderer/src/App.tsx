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
import { ResultsView } from '@/features/results/results-view'
import { SettingsDialog } from '@/features/settings/settings-dialog'
import { UpdateBadge, UpdateDialogHost } from '@/features/update/update-badge'
import type { AnalysisResult, AppInfo } from '@shared/types'

export default function App(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('analyze')
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const result = useAnalysisStore((s) => s.result)
  const openEpisode = useResultsStore((s) => s.openEpisode)
  const jaAberto = useRef<AnalysisResult | null>(null)

  useEffect(() => {
    void window.ancut.app.info().then(setInfo)
  }, [])

  // Análise terminou: abre o resultado em vez de deixar o usuário caçá-lo no
  // histórico. A navegação mora aqui, e não no store da análise, porque é a
  // App que é dona das abas — o store não deveria saber que abas existem.
  //
  // O guard compara a IDENTIDADE do objeto, não o episodeId: reanalisar o
  // mesmo episódio produz um result novo com o mesmo id, e comparar id
  // deixaria de reabrir justamente na reanálise. `begin()` zera o result, então
  // cada execução traz um objeto novo.
  useEffect(() => {
    if (!result || jaAberto.current === result) return
    jaAberto.current = result
    void openEpisode(result.episodeId).then(() => setTab('results'))
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
        {tab === 'analyze' ? <AnalyzeView /> : <ResultsView />}
      </main>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} info={info} />
      <UpdateDialogHost />
    </div>
  )
}
