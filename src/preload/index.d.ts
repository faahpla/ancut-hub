import type { AnCutBridge } from '../shared/types'

declare global {
  interface Window {
    ancut: AnCutBridge
    ancutFiles: {
      /** Caminho absoluto de um arquivo arrastado (Electron 32+). */
      pathFor(file: File): string
    }
  }
}

export {}
