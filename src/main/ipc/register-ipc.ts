import { app, dialog, ipcMain, nativeImage, shell } from 'electron'
import { join } from 'node:path'
import { CH } from '../../shared/channels'
import type { AnalysisRequest, AppInfo, AppSettings } from '../../shared/types'
import { allowMediaRoot, mediaUrlPrefix } from '../register-protocol'
import type { PythonService } from '../services/python-service'
import type { UpdateService } from '../services/update-service'
import { SettingsStore } from '../store/settings-store'
import type { WindowManager } from '../windows/window-manager'

const VIDEO_EXTS = ['mp4', 'mkv', 'mov', 'avi', 'webm', 'ts', 'm2ts']

/** Guardado entre arrastos: ler e redimensionar o PNG toda vez é desperdício. */
let iconeReserva: Electron.NativeImage | null = null

/**
 * O que o cursor carrega durante o arrasto. O Windows EXIGE um ícone não
 * vazio — sem ele o `startDrag` lança e o arrasto nem começa.
 */
function dragIcon(keyframe: string | null): Electron.NativeImage {
  if (keyframe) {
    const img = nativeImage.createFromPath(keyframe)
    // 128px porque o keyframe é um frame inteiro (1920px): arrastar a imagem
    // em tamanho real cobriria a tela.
    if (!img.isEmpty()) return img.resize({ width: 128 })
  }
  iconeReserva ??= nativeImage
    .createFromPath(join(__dirname, '../../resources/icon.png'))
    .resize({ width: 64 })
  return iconeReserva
}

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

  ipcMain.handle(CH.animeFolder, async (_e, anime: string) => python.animeFolder(anime))
  ipcMain.handle(
    CH.hasAnalysis,
    async (
      _e,
      source: string,
      anime: string,
      season: number,
      episode: number,
      kind: string
    ) => python.hasAnalysis(source, anime, season, episode, kind)
  )

  // -------------------------------------------------------- resultados
  ipcMain.handle(CH.recentEpisodes, async () => python.recentEpisodes())
  ipcMain.handle(CH.explorerScan, async (_e, episodeId: number) =>
    python.explorerScan(episodeId)
  )
  ipcMain.handle(
    CH.explorerApply,
    async (_e, episodeId: number, characterIds: number[]) =>
      python.explorerApply(episodeId, characterIds)
  )
  ipcMain.handle(CH.orphanScan, async () => python.orphanEpisodes())
  ipcMain.handle(CH.orphanRestore, async (_e, root: string) => python.restoreEpisode(root))
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
  ipcMain.handle(CH.benchmarkAdd, async (_e, episodeId: number, label: string) =>
    python.markBenchmark(episodeId, label ?? '')
  )

  ipcMain.handle(CH.harvestStart, async (_e, episodeId: number) =>
    python.harvest(episodeId, (event) => windows.send(CH.harvestEvent, event))
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

  // `on` e não `handle`: o arrasto tem que começar DENTRO do gesto de mouse
  // que o sistema já está acompanhando. Um `invoke` devolveria a promessa
  // depois, e o Windows já teria desistido do arrasto.
  ipcMain.on(CH.startDrag, (event, files: string[], icon: string | null) => {
    if (!Array.isArray(files) || files.length === 0) return
    try {
      event.sender.startDrag({ file: files[0], files, icon: dragIcon(icon) })
    } catch (err) {
      // Ícone vazio faz o startDrag lançar. Melhor perder o arrasto do que
      // derrubar o processo principal com o app inteiro junto.
      console.error('[drag] não consegui iniciar o arrasto:', err)
    }
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
