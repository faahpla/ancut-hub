import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { CH } from '../shared/channels'
import type {
  AnalysisEvent,
  AnalysisRequest,
  AnCutBridge,
  AppInfo,
  AppSettings,
  EpisodeKind,
  HarvestEvent,
  UpdateStatus
} from '../shared/types'

/**
 * Ponte única entre renderer e main.
 *
 * Só importa de `channels.ts` (que não tem dependência nenhuma) e tipos
 * (que somem na compilação) — se um import de runtime entrar aqui, o bundle
 * do preload incha e o custo aparece na abertura do app.
 */
const bridge: AnCutBridge = {
  analysis: {
    start: (req: AnalysisRequest) => ipcRenderer.invoke(CH.analysisStart, req),
    cancel: () => ipcRenderer.invoke(CH.analysisCancel),
    commitDiscovery: (names, removed) =>
      ipcRenderer.invoke(CH.commitDiscovery, names, removed),
    onEvent: (handler: (event: AnalysisEvent) => void) => {
      const listener = (_e: unknown, payload: AnalysisEvent): void => handler(payload)
      ipcRenderer.on(CH.analysisEvent, listener)
      return () => {
        ipcRenderer.off(CH.analysisEvent, listener)
      }
    }
  },
  dialog: {
    pickVideo: () => ipcRenderer.invoke(CH.pickVideo),
    pickFolder: (current?: string) => ipcRenderer.invoke(CH.pickFolder, current)
  },
  episode: {
    parseFilename: (path: string) => ipcRenderer.invoke(CH.parseFilename, path),
    skipRanges: (anime: string) => ipcRenderer.invoke(CH.skipRanges, anime),
    animeFolder: (anime: string) => ipcRenderer.invoke(CH.animeFolder, anime),
    hasAnalysis: (
      source: string,
      anime: string,
      season: number,
      episode: number,
      kind: EpisodeKind
    ) => ipcRenderer.invoke(CH.hasAnalysis, source, anime, season, episode, kind)
  },
  results: {
    recent: () => ipcRenderer.invoke(CH.recentEpisodes),
    explorerScan: (episodeId: number) => ipcRenderer.invoke(CH.explorerScan, episodeId),
    explorerApply: (episodeId: number, characterIds: number[]) =>
      ipcRenderer.invoke(CH.explorerApply, episodeId, characterIds),
    orphans: () => ipcRenderer.invoke(CH.orphanScan),
    restore: (root: string) => ipcRenderer.invoke(CH.orphanRestore, root),
    mergeAnimePlan: (origem: string, destino: string) =>
      ipcRenderer.invoke(CH.mergeAnimePlan, origem, destino),
    mergeAnimeApply: (origem: string, destino: string) =>
      ipcRenderer.invoke(CH.mergeAnimeApply, origem, destino),
    setSeasonPlan: (episodeIds: number[], season: number) =>
      ipcRenderer.invoke(CH.setSeasonPlan, episodeIds, season),
    setSeasonApply: (episodeIds: number[], season: number) =>
      ipcRenderer.invoke(CH.setSeasonApply, episodeIds, season),
    characters: (termo = '') => ipcRenderer.invoke(CH.characters, termo),
    characterShots: (ids: number[]) => ipcRenderer.invoke(CH.characterShots, ids),
    deleteEpisodePlan: (episodeId: number) =>
      ipcRenderer.invoke(CH.deleteEpisodePlan, episodeId),
    deleteEpisodeApply: (episodeId: number) =>
      ipcRenderer.invoke(CH.deleteEpisodeApply, episodeId),
    load: (episodeId: number) => ipcRenderer.invoke(CH.loadResults, episodeId),
    shots: (episodeId: number, characterId: number) =>
      ipcRenderer.invoke(CH.loadShots, episodeId, characterId),
    merge: (episodeId: number, shotIds: number[]) =>
      ipcRenderer.invoke(CH.mergeShots, episodeId, shotIds),
    remove: (episodeId: number, shotIds: number[]) =>
      ipcRenderer.invoke(CH.deleteShots, episodeId, shotIds),
    harvest: (episodeId: number) => ipcRenderer.invoke(CH.harvestStart, episodeId),
    onHarvestEvent: (handler: (event: HarvestEvent) => void) => {
      const listener = (_e: unknown, payload: HarvestEvent): void => handler(payload)
      ipcRenderer.on(CH.harvestEvent, listener)
      return () => {
        ipcRenderer.off(CH.harvestEvent, listener)
      }
    },
    markBenchmark: (episodeId: number, label = '') =>
      ipcRenderer.invoke(CH.benchmarkAdd, episodeId, label),
    grantMedia: (episodeRoot: string) => ipcRenderer.invoke(CH.mediaUrls, episodeRoot)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(CH.settingsGet),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(CH.settingsSet, patch)
  },
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke(CH.appInfo)
  },
  update: {
    status: () => ipcRenderer.invoke(CH.updateStatus),
    check: () => ipcRenderer.invoke(CH.updateCheck),
    download: () => ipcRenderer.invoke(CH.updateDownload),
    apply: () => ipcRenderer.invoke(CH.updateApply),
    onEvent: (handler: (status: UpdateStatus) => void) => {
      const listener = (_e: unknown, payload: UpdateStatus): void => handler(payload)
      ipcRenderer.on(CH.updateEvent, listener)
      return () => {
        ipcRenderer.off(CH.updateEvent, listener)
      }
    }
  },
  shell: {
    reveal: (path: string) => ipcRenderer.invoke(CH.revealPath, path),
    open: (path: string) => ipcRenderer.invoke(CH.openPath, path),
    startDrag: (files: string[], icon?: string | null) =>
      ipcRenderer.send(CH.startDrag, files, icon ?? null)
  },
  window: {
    minimize: () => ipcRenderer.send(CH.winMinimize),
    maximizeToggle: () => ipcRenderer.send(CH.winMaximizeToggle),
    close: () => ipcRenderer.send(CH.winClose),
    onMaximizedChanged: (handler: (maximized: boolean) => void) => {
      const listener = (_e: unknown, maximized: boolean): void => handler(maximized)
      ipcRenderer.on(CH.winMaximizedChanged, listener)
      return () => {
        ipcRenderer.off(CH.winMaximizedChanged, listener)
      }
    }
  }
}

contextBridge.exposeInMainWorld('ancut', bridge)

/**
 * Caminho real de um arquivo arrastado pra janela.
 *
 * `File.path` não existe mais desde o Electron 32 — o caminho só vem por
 * `webUtils.getPathForFile`, e isso exige o preload (não dá pra chamar do
 * renderer). O AnCut vive de arrastar episódio pra dentro, então isto é
 * essencial, não conveniência.
 */
contextBridge.exposeInMainWorld('ancutFiles', {
  pathFor: (file: File): string => webUtils.getPathForFile(file)
})
