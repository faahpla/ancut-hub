import { Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Brand } from '@/components/layout/brand'
import { DeviceBadge } from '@/components/layout/device-badge'
import { TabBar, type TabKey } from '@/components/layout/tab-bar'
import { TitleBar } from '@/components/layout/title-bar'
import { Button } from '@/components/ui/button'
import { AnalyzeView } from '@/features/analyze/analyze-view'
import { ResultsView } from '@/features/results/results-view'
import { SettingsDialog } from '@/features/settings/settings-dialog'
import { UpdateBadge, UpdateDialogHost } from '@/features/update/update-badge'
import type { AppInfo } from '@shared/types'

export default function App(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('analyze')
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    void window.ancut.app.info().then(setInfo)
  }, [])

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
