import { protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
import { normalize, resolve, sep } from 'node:path'

/**
 * Dois esquemas próprios:
 *
 * `app://local/…`  — serve o renderer compilado por uma origem real e segura
 *                    em vez de file://, que é opaca e derruba várias APIs do
 *                    navegador (lição do Focus HUB).
 *
 * `media://local/…` — serve keyframes e clipes do disco pro <img> e <video>.
 *                     Sem isto o renderer teria que carregar file:// (bloqueado
 *                     pela CSP) ou receber os bytes por IPC (péssimo pra vídeo,
 *                     que precisa de range requests pra dar seek).
 */
export const APP_SCHEME = 'app'
export const APP_ORIGIN = 'app://local'
export const MEDIA_SCHEME = 'media'

/**
 * Raízes liberadas pro esquema media://. Só caminhos DENTRO delas são
 * servidos — o renderer não consegue pedir um arquivo arbitrário do sistema.
 * A aba Resultados registra a pasta do episódio ao abrir um resultado.
 */
const allowedRoots = new Set<string>()

export function allowMediaRoot(root: string): void {
  allowedRoots.add(resolve(root))
}

function isAllowed(target: string): boolean {
  const full = resolve(target)
  for (const root of allowedRoots) {
    if (full === root || full.startsWith(root + sep)) return true
  }
  return false
}

/** Registrado UMA vez, antes do "ready", pros esquemas agirem como https. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    },
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        // `stream: true` é o que habilita range requests — sem isso o
        // <video> não consegue dar seek no clipe.
        stream: true
      }
    }
  ])
}

/** Chamado depois do "ready". `rendererDir` = pasta do index.html compilado. */
export function serveProtocols(rendererDir: string): void {
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url)
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const target = normalize(resolve(rendererDir, rel || 'index.html'))
    // Impede subir de pasta com ../
    if (!target.startsWith(resolve(rendererDir))) {
      return new Response('forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })

  protocol.handle(MEDIA_SCHEME, (request) => {
    const url = new URL(request.url)
    const target = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    if (!target || !isAllowed(target)) {
      return new Response('forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })
}

/**
 * Prefixo de URL media:// pra uma pasta. O renderer concatena o caminho
 * relativo do shot (também codificado) e usa direto em <img>/<video>.
 *
 * O caminho vai inteiro em percent-encoding — inclusive `:` e `\` — pra um
 * "C:\Pasta com espaço\" não virar autoridade nem quebrar o parser de URL.
 */
export function mediaUrlPrefix(root: string): string {
  return `${MEDIA_SCHEME}://local/${encodeURIComponent(resolve(root))}/`
}
