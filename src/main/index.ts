import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { CH } from '../shared/channels'
import { registerIpc } from './ipc/register-ipc'
import { registerSchemes, serveProtocols } from './register-protocol'
import { PythonService } from './services/python-service'
import { UpdateService } from './services/update-service'
import { SettingsStore } from './store/settings-store'
import { WindowManager } from './windows/window-manager'

// Precisa rodar ANTES do evento "ready".
registerSchemes()

const windows = new WindowManager()
const settings = new SettingsStore()
const python = new PythonService((event) => windows.send(CH.analysisEvent, event))
const updates = new UpdateService(
  (status) => windows.send(CH.updateEvent, status),
  () => python.running
)

// Uma instância só: abrir de novo traz a janela existente pra frente em vez
// de subir um segundo processo (que brigaria pelo mesmo config.json).
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => windows.showMain())

  app.whenReady().then(() => {
    // O renderer compilado fica em out/renderer (irmão de out/main).
    serveProtocols(join(__dirname, '../renderer'))
    registerIpc(windows, settings, python, updates)
    windows.createMain()

    // Checagem automática, uma vez por abertura. Os 12s de atraso são pra não
    // disputar a abertura da janela nem o probe da GPU (que já custa ~4s);
    // atualização é assunto de fundo, não pode atrasar o app aparecendo.
    if (updates.getStatus().supported) {
      setTimeout(() => void updates.check(), 12_000)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) windows.createMain()
    })
  })

  // Matar o filho Python ao sair é obrigatório: órfão, ele continuaria
  // segurando a GPU e o modelo na memória sem janela nenhuma.
  app.on('before-quit', () => python.dispose())

  app.on('window-all-closed', () => {
    python.dispose()
    if (process.platform !== 'darwin') app.quit()
  })
}
