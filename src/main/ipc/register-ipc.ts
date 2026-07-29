import { app, dialog, ipcMain, shell } from 'electron'
import { CH } from '../../shared/channels'
import type { AnalysisRequest, AppInfo, AppSettings } from '../../shared/types'
import { allowMediaRoot, mediaUrlPrefix } from '../register-protocol'
import type { PythonService } from '../services/python-service'
import type { UpdateService } from '../services/update-service'
import { SettingsStore } from '../store/settings-store'
import type { WindowManager } from '../windows/window-manager'

const VIDEO_EXTS = ['mp4', 'mkv', 'mov', 'avi', 'webm', 'ts', 'm2ts']

export function registerIpc(
  windows: WindowManager,
  settings: SettingsStore,
  python: PythonService,
  updates: UpdateService
): void {
  // ------------------------------------------------------- atualização
  ipcMain.handle(CH.updateStatus, async () => updates.getStatus())
  ipcMain.handle(CH.updateCheck, async () => updates.check())
  ipcMain.handle(CH.updateDownload, async () => updates.download())
  ipcMain.handle(CH.updateApply, async () => updates.apply())

  // ---------------------------------------------------------- settings
  ipcMain.handle(CH.settingsGet, async (): Promise<AppSettings> => settings.get())
  ipcMain.handle(
    CH.settingsSet,
    async (_e, patch: Partial<AppSettings>): Promise<AppSettings> => settings.set(patch)
  )

  // ------------------------------------------------------------- app
  ipcMain.handle(CH.appInfo, async (): Promise<AppInfo> => {
    // Quem sabe da GPU é o Python (torch.cuda). O probe custa ~4s na
    // primeira chamada e fica cacheado depois.
    const probe = await python.probe()
    return {
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      gpuName: probe?.gpuName ?? null
    }
  })

  // ---------------------------------------------------------- diálogos
  ipcMain.handle(CH.pickVideo, async (): Promise<string | null> => {
    const win = windows.getMain()
    const opts: Electron.OpenDialogOptions = {
      title: 'Selecionar episódio',
      properties: ['openFile'],
      filters: [{ name: 'Vídeo', extensions: VIDEO_EXTS }]
    }
    const res = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts)
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })

  ipcMain.handle(CH.pickFolder, async (_e, current?: string): Promise<string | null> => {
    const win = windows.getMain()
    const opts: Electron.OpenDialogOptions = {
      title: 'Pasta de saída',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: current || undefined
    }
    const res = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts)
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })

  // -------------------------------------------- consultas de episódio
  ipcMain.handle(CH.parseFilename, async (_e, path: string) =>
    python.parseFilename(path)
  )
  ipcMain.handle(CH.skipRanges, async (_e, anime: string) => python.skipRanges(anime))
  ipcMain.handle(
    CH.hasAnalysis,
    async (_e, source: string, anime: string, season: number, episode: number) =>
      python.hasAnalysis(source, anime, season, episode)
  )

  // -------------------------------------------------------- resultados
  ipcMain.handle(CH.recentEpisodes, async () => python.recentEpisodes())
  ipcMain.handle(CH.loadResults, async (_e, episodeId: number) =>
    python.loadResults(episodeId)
  )
  ipcMain.handle(
    CH.loadShots,
    async (_e, episodeId: number, characterId: number) =>
      python.loadShots(episodeId, characterId)
  )
  ipcMain.handle(
    CH.mergeShots,
    async (_e, episodeId: number, shotIds: number[]) =>
      python.mergeShots(episodeId, shotIds)
  )
  ipcMain.handle(
    CH.deleteShots,
    async (_e, episodeId: number, shotIds: number[]) =>
      python.deleteShots(episodeId, shotIds)
  )
  ipcMain.handle(CH.mediaUrls, async (_e, episodeRoot: string): Promise<string> => {
    // Liberar a raiz é o que autoriza o renderer a ler dali via media://.
    allowMediaRoot(episodeRoot)
    return mediaUrlPrefix(episodeRoot)
  })

  // ------------------------------------------------------------- shell
  ipcMain.handle(CH.revealPath, async (_e, path: string): Promise<void> => {
    shell.showItemInFolder(path)
  })
  ipcMain.handle(CH.openPath, async (_e, path: string): Promise<void> => {
    await shell.openPath(path)
  })

  // ---------------------------------------------------- janela frameless
  ipcMain.on(CH.winMinimize, () => windows.getMain()?.minimize())
  ipcMain.on(CH.winMaximizeToggle, () => {
    const win = windows.getMain()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on(CH.winClose, () => windows.getMain()?.close())

  // ---------------------------------------------------------- análise
  ipcMain.handle(
    CH.analysisStart,
    async (_e, req: AnalysisRequest): Promise<{ runId: string }> => {
      // Persiste o que o usuário escolheu ANTES de rodar: se a análise
      // quebrar, os campos continuam preenchidos na próxima abertura.
      await settings.set({
        outputDir: req.outputDir,
        lastAnime: req.anime,
        lastSeason: req.season,
        lastEpisode: req.episode,
        params: req.params,
        useDanbooru: req.useDanbooru
      })
      return { runId: python.start(req) }
    }
  )

  ipcMain.handle(CH.analysisCancel, async (): Promise<void> => {
    python.cancel()
  })

  ipcMain.handle(
    CH.commitDiscovery,
    async (
      _e,
      names: Record<number, string>,
      removed: Record<number, number[]>
    ): Promise<void> => {
      python.commitDiscovery(names, removed)
    }
  )
}
