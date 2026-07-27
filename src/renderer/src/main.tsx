import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useAnalysisStore } from './stores/analysis-store'
import { useEpisodeStore } from './stores/episode-store'
import './styles/globals.css'

/**
 * Ponte de depuração: dá acesso aos stores pelo console do DevTools e pelo
 * CDP (usado pra dirigir a interface em verificação automatizada).
 *
 * Não é brecha de segurança: o estado do renderer já é totalmente acessível
 * por quem abre o DevTools. O que protege o lado Node é o contextIsolation,
 * que continua ligado — daqui não se alcança fs, child_process nem nada além
 * da ponte `window.ancut`.
 */
;(window as unknown as Record<string, unknown>).__ancutDebug = {
  episode: useEpisodeStore,
  analysis: useAnalysisStore
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
