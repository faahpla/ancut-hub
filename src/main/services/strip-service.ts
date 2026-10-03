import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { app, nativeImage } from 'electron'
import type { ClipStrip } from '../../shared/types'
import { allowMediaRoot, mediaUrlPrefix } from '../register-protocol'

/**
 * A TIRA DE QUADROS que a prévia do card percorre com o mouse.
 *
 * A prévia guiada fazia isso com um <video>, atribuindo `currentTime` a cada
 * movimento do mouse. Não funciona com estes arquivos: os clipes que o motor
 * corta têm UM ÚNICO quadro-chave, no início — então cada busca pro meio do
 * clipe obriga o navegador a decodificar desde o quadro zero, e o mouse pede
 * dezenas de buscas por segundo. No primeiro hover, com o arquivo ainda
 * chegando, cada busca nova cancelava a anterior antes de ela pintar: o card
 * parecia morto até a pessoa sair e voltar (aí o arquivo já estava em cache,
 * e "funcionava" travando). Reportado assim, palavra por palavra.
 *
 * O Dangai bateu no mesmo problema com os MESMOS clipes, e resolveu assim —
 * isto é o porte da solução de lá: o ffmpeg decodifica o clipe UMA vez, em
 * sequência (o único jeito barato de ler um arquivo desses), amostra
 * QUADROS quadros e eles viram uma grade numa imagem só. Percorrer o clipe
 * passa a ser trocar qual pedaço da imagem aparece — custo zero por
 * movimento, como YouTube e Netflix fazem a prévia da barra de tempo.
 *
 * Diferença de lá: o Dangai monta a grade com o `sharp`, que é módulo
 * nativo. Aqui ele não pode entrar — a atualização leve leva só o
 * `app.asar`, e um binário nativo fora dele não chegaria em quem atualiza
 * pelo app. O `nativeImage` do próprio Electron monta e salva a imagem.
 */
const VERSAO = 2
const QUADROS = 24
/** Um pouco acima do card (~180px), pra não borrar em tela de alta densidade. */
const LARGURA = 256
const ALTURA = 144
const COLUNAS = 6

/**
 * Onde está o ffmpeg. O app instalado leva o dele dentro do motor; em
 * desenvolvimento, o repositório do motor tem o mesmo binário em bin/. Sem
 * nenhum dos dois, o do PATH.
 */
function ferramenta(nome: 'ffmpeg'): string {
  const exe = `${nome}.exe`
  const candidatos = app.isPackaged
    ? [join(dirname(app.getPath('exe')), 'engine', '_internal', 'bin', exe)]
    : [join(resolve(__dirname, '../../..'), 'ancut-hub-engine', 'bin', exe)]
  return candidatos.find((c) => existsSync(c)) ?? nome
}

function pastaDoCache(): string {
  const pasta = join(app.getPath('userData'), 'tiras-previa')
  mkdirSync(pasta, { recursive: true })
  // A tira é servida pelo media://, que só atende raiz liberada.
  allowMediaRoot(pasta)
  return pasta
}

/*
 * Um pedido por clipe de cada vez. O mouse pode sair e voltar no mesmo card
 * antes de a primeira tira ficar pronta, e sem isto seriam dois ffmpeg lendo
 * o mesmo arquivo pra gravar o mesmo resultado.
 */
const emAndamento = new Map<string, Promise<ClipStrip>>()

export function tiraDoClipe(caminho: string): Promise<ClipStrip> {
  const pendente = emAndamento.get(caminho)
  if (pendente) return pendente
  const pedido = gerar(caminho).finally(() => emAndamento.delete(caminho))
  emAndamento.set(caminho, pedido)
  return pedido
}

async function gerar(caminho: string): Promise<ClipStrip> {
  const pasta = pastaDoCache()

  /*
   * A chave leva tamanho e data junto do caminho, e é SHA-1. Mesclar ou
   * recortar uma cena reescreve o clipe no MESMO caminho — sem tamanho e data
   * na chave, a tira velha continuaria aparecendo pro clipe novo.
   */
  const st = statSync(caminho)
  const chave = createHash('sha1')
    .update(`${caminho}|${st.size}|${st.mtimeMs}`)
    .digest('hex')
    .slice(0, 24)
  const nome = `tira-v${VERSAO}-${chave}.jpg`
  const alvo = join(pasta, nome)
  const meta = `${alvo}.json`
  const url = mediaUrlPrefix(pasta) + encodeURIComponent(nome)

  if (existsSync(alvo) && existsSync(meta)) {
    try {
      const lido = JSON.parse(readFileSync(meta, 'utf8')) as Omit<ClipStrip, 'url'>
      return { ...lido, url }
    } catch {
      /* metadado corrompido: refaz abaixo */
    }
  }

  const quadros = await quadrosEmSequencia(caminho)
  if (quadros.length === 0) throw new Error('o clipe não devolveu nenhum quadro')

  // A grade tem o número de quadros que o ffmpeg DEVOLVEU, não o pedido: em
  // vários clipes ele entrega 23, e uma grade de 24 com um buraco preto no
  // fim mostraria preto justo quando o mouse chega na borda.
  const colunas = Math.min(COLUNAS, quadros.length)
  const linhas = Math.ceil(quadros.length / colunas)
  const larguraGrade = colunas * LARGURA
  const grade = Buffer.alloc(larguraGrade * linhas * ALTURA * 4)
  quadros.forEach((q, i) => {
    const x0 = (i % colunas) * LARGURA
    const y0 = Math.floor(i / colunas) * ALTURA
    for (let y = 0; y < ALTURA; y++) {
      q.copy(
        grade,
        ((y0 + y) * larguraGrade + x0) * 4,
        y * LARGURA * 4,
        (y + 1) * LARGURA * 4
      )
    }
  })

  const imagem = nativeImage.createFromBitmap(grade, {
    width: larguraGrade,
    height: linhas * ALTURA
  })
  // Grava por um nome temporário e renomeia: um card que pedir a mesma tira
  // no meio da gravação nunca lê um JPEG pela metade.
  const parcial = `${alvo}.part`
  writeFileSync(parcial, imagem.toJPEG(72))
  renameSync(parcial, alvo)

  const saida: Omit<ClipStrip, 'url'> = { quadros: quadros.length, colunas, linhas }
  writeFileSync(meta, JSON.stringify(saida))
  return { ...saida, url }
}

/**
 * Decodifica o clipe do início ao fim e devolve QUADROS quadros espalhados
 * por ele, crus.
 *
 * **Sem perguntar a duração antes.** A primeira versão rodava um ffprobe pra
 * calcular o `fps` de amostragem, e ele sozinho custava 0,86s com o
 * binário frio — mais que o próprio corte da tira. Medido no clipe de 10s do
 * Slime S04E23: a decodificação inteira custa ~0,6s de qualquer jeito (o
 * clipe tem um quadro-chave só, então não há atalho), e reduzir todos os
 * quadros pra miniatura em vez de só 24 empatou no tempo. Então o ffmpeg
 * entrega todos, e a escolha acontece aqui, no caminho.
 *
 * De quebra, a tira cobre do primeiro ao último quadro DE FATO — o `fps`
 * calculado em cima da duração entregava 23 em vários clipes, ou parava
 * antes do fim.
 *
 * A memória não cresce com o clipe: guarda no máximo 2×QUADROS. Quando
 * passa disso, descarta um sim um não e dobra o passo — no fim, o que sobrou
 * está espaçado por igual, e daí saem os QUADROS.
 *
 * Cru e não JPEG no pipe porque quadro cru tem tamanho FIXO: separar um do
 * outro é contar bytes. Em BGRA porque é o formato que o `nativeImage`
 * recebe. E o recorte é o `object-cover` do card — cobre 16:9 e corta a
 * sobra —, pra tira mostrar exatamente o enquadramento da miniatura.
 */
function quadrosEmSequencia(caminho: string): Promise<Buffer[]> {
  return new Promise((ok, falha) => {
    const bytes = LARGURA * ALTURA * 4
    const p = spawn(
      ferramenta('ffmpeg'),
      [
        '-v', 'error',
        '-i', caminho,
        '-an', '-sn',
        '-vf',
        `scale=${LARGURA}:${ALTURA}:force_original_aspect_ratio=increase:flags=fast_bilinear,crop=${LARGURA}:${ALTURA}`,
        '-f', 'rawvideo',
        '-pix_fmt', 'bgra',
        '-'
      ],
      { windowsHide: true }
    )
    let guardados: Buffer[] = []
    let passo = 1
    let indice = 0
    let sobra: Buffer = Buffer.alloc(0)
    p.stdout.on('data', (pedaco: Buffer) => {
      sobra = sobra.length === 0 ? Buffer.from(pedaco) : Buffer.concat([sobra, pedaco])
      while (sobra.length >= bytes) {
        if (indice % passo === 0) {
          guardados.push(Buffer.from(sobra.subarray(0, bytes)))
          if (guardados.length > 2 * QUADROS) {
            guardados = guardados.filter((_, i) => i % 2 === 0)
            passo *= 2
          }
        }
        indice++
        sobra = sobra.subarray(bytes)
      }
    })
    p.stderr.resume()
    p.on('error', falha)
    p.on('close', (codigo) => {
      if (codigo !== 0 && guardados.length === 0) {
        falha(new Error(`ffmpeg saiu com ${codigo}`))
        return
      }
      if (guardados.length <= QUADROS) {
        ok(guardados)
        return
      }
      // Do que sobrou (já espaçado por igual), QUADROS do primeiro ao último.
      const n = guardados.length
      ok(
        Array.from({ length: QUADROS }, (_, j) =>
          guardados[Math.round((j * (n - 1)) / (QUADROS - 1))]
        )
      )
    })
  })
}
