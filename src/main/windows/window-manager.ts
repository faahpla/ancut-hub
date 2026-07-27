import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { CH } from '../../shared/channels'
import { APP_ORIGIN } from '../register-protocol'

const preload = join(__dirname, '../preload/index.js')

/**
 * URL do renderer: o dev server do Vite quando rodando sob electron-vite
 * (que define ELECTRON_RENDERER_URL), senão os arquivos compilados servidos
 * por app://. Cobre dev, build direto e app empacotado.
 */
function rendererUrl(): string {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  return devUrl ? devUrl : `${APP_ORIGIN}/index.html`
}

export class WindowManager {
  private main: BrowserWindow | null = null

  getMain(): BrowserWindow | null {
    return this.main
  }

  createMain(): BrowserWindow {
    const win = new BrowserWindow({
      width: 1240,
      height: 820,
      minWidth: 960,
      minHeight: 640,
      // No Windows, width/height medem a MOLDURA, não a área de conteúdo —
      // sem isto a barra de título come ~38px e o rodapé sai da tela.
      useContentSize: true,
      show: false,
      frame: false,
      titleBarStyle: 'hidden',
      // Mesma cor do --background: evita o flash branco antes do primeiro paint.
      backgroundColor: '#161b22',
      roundedCorners: true,
      webPreferences: {
        preload,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        // A prévia de cena toca sozinha no hover, sem clique do usuário.
        autoplayPolicy: 'no-user-gesture-required'
      }
    })

    win.on('ready-to-show', () => win.show())

    // A barra de título é nossa: o renderer precisa saber o estado pra
    // trocar o ícone de maximizar/restaurar.
    const emitMaximized = (): void =>
      win.webContents.send(CH.winMaximizedChanged, win.isMaximized())
    win.on('maximize', emitMaximized)
    win.on('unmaximize', emitMaximized)

    // Link externo abre no navegador, nunca dentro do app.
    win.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // Diagnóstico do renderer no stdout do main — indispensável quando a
    // janela abre preta e não dá pra ver o DevTools.
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      console.log(`[renderer:${level}] ${message} (${source}:${line})`)
    })
    win.webContents.on('preload-error', (_e, preloadPath, error) => {
      console.error(`[preload-error] ${preloadPath}:`, error)
    })
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error(`[did-fail-load] ${code} ${desc} ${url}`)
    })

    win.loadURL(rendererUrl())
    win.on('closed', () => {
      this.main = null
    })

    this.main = win
    return win
  }

  showMain(): void {
    if (!this.main) {
      this.createMain()
      return
    }
    if (this.main.isMinimized()) this.main.restore()
    this.main.show()
    this.main.focus()
  }

  send(channel: string, payload: unknown): void {
    this.main?.webContents.send(channel, payload)
  }
}
