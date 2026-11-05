import { app, net } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  EventoLink,
  PedidoDownload,
  QualidadeDownload,
  ResultadoDownload,
  VideoDoLink
} from '../../shared/types'
import { ferramenta } from './strip-service'

/**
 * Baixar vídeo por link — trailer, gameplay, teaser — pra virar B-roll.
 *
 * Quem baixa é o **yt-dlp**, o padrão pra isso (o Media Hub usa o mesmo).
 * Ele NÃO vai no instalador: o YouTube muda o tempo todo e um yt-dlp parado
 * quebra em semanas, então o app baixa na primeira vez e pede pra ele se
 * atualizar uma vez por dia. Junto vem o **Deno**: desde o fim de 2025 o
 * yt-dlp precisa de um JavaScript de fora pra resolver o desafio do YouTube,
 * e o Node que vem dentro do Electron é velho demais pra ele (testado: 20.18
 * aparece como "unsupported"). O ffmpeg, que junta áudio e vídeo, é o do
 * motor.
 *
 * Tudo mora em %LOCALAPPDATA%\AnCut HUB\ferramentas — fora da pasta do app,
 * pra sobreviver às atualizações dele.
 */

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
const DENO_ZIP = 'deno-x86_64-pc-windows-msvc.zip'
const DENO_GITHUB = `https://github.com/denoland/deno/releases/latest/download/${DENO_ZIP}`
const UM_DIA_MS = 24 * 60 * 60 * 1000
/** Sem chegar nenhum byte por este tempo, o download é dado como travado. */
const PARADO_MS = 45_000

/**
 * Onde baixar o Deno. O servidor do próprio Deno primeiro: no dia em que
 * isto foi feito o GitHub devolvia 504 pro zip dele, e o dl.deno.land
 * respondia na hora. O GitHub fica de reserva.
 */
async function enderecosDoDeno(): Promise<string[]> {
  const lista: string[] = []
  try {
    const r = await net.fetch('https://dl.deno.land/release-latest.txt', {
      signal: AbortSignal.timeout(15_000)
    })
    const versao = (await r.text()).trim()
    if (r.ok && /^v\d+\.\d+\.\d+$/.test(versao)) {
      lista.push(`https://dl.deno.land/release/${versao}/${DENO_ZIP}`)
    }
  } catch {
    // sem resposta do servidor do Deno: fica só o GitHub
  }
  lista.push(DENO_GITHUB)
  return lista
}

function pastaDasFerramentas(): string {
  const base = process.env['LOCALAPPDATA'] ?? app.getPath('userData')
  return join(base, 'AnCut HUB', 'ferramentas')
}

/** Baixa um arquivo grande avisando o progresso. Grava em `.baixando` e só
 *  renomeia no fim: um download interrompido não pode parecer ferramenta
 *  pronta na próxima vez. */
async function baixarArquivo(
  url: string,
  destino: string,
  aoProgredir: (fracao: number) => void
): Promise<void> {
  // Sem isto, um servidor que aceita a conexão e não manda nada deixava a
  // tela em "Baixando… 0%" pra sempre. O relógio zera a cada pedaço que chega.
  const controle = new AbortController()
  let relogio = setTimeout(() => controle.abort(), PARADO_MS)
  const vivo = (): void => {
    clearTimeout(relogio)
    relogio = setTimeout(() => controle.abort(), PARADO_MS)
  }
  const temporario = `${destino}.baixando`
  try {
    const res = await net.fetch(url, { signal: controle.signal })
    if (!res.ok || !res.body) throw new Error(`o servidor respondeu ${res.status}`)
    vivo()
    const total = Number(res.headers.get('content-length') ?? 0)
    const arquivo = createWriteStream(temporario)
    const leitor = res.body.getReader()
    let lidos = 0
    try {
      for (;;) {
        const { done, value } = await leitor.read()
        if (done) break
        vivo()
        lidos += value.byteLength
        if (!arquivo.write(value)) {
          await new Promise<void>((ok) => arquivo.once('drain', () => ok()))
        }
        if (total > 0) aoProgredir(Math.min(1, lidos / total))
      }
    } finally {
      await new Promise<void>((ok) => arquivo.end(() => ok()))
    }
  } catch (e) {
    await rm(temporario, { force: true })
    if (controle.signal.aborted) throw new Error('o download parou de responder')
    throw e
  } finally {
    clearTimeout(relogio)
  }
  await rm(destino, { force: true })
  await rename(temporario, destino)
}

/** Tenta os endereços em ordem; o erro que sobe é o do último. */
async function baixarDeAlgum(
  urls: string[],
  destino: string,
  aoProgredir: (fracao: number) => void
): Promise<void> {
  let ultimo: unknown = null
  for (const url of urls) {
    try {
      await baixarArquivo(url, destino, aoProgredir)
      return
    } catch (e) {
      ultimo = e
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error('o download falhou')
}

function rodarSimples(exe: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((ok, falha) => {
    execFile(exe, args, { windowsHide: true, timeout: timeoutMs }, (erro, stdout) => {
      if (erro) falha(erro)
      else ok(String(stdout))
    })
  })
}

/** A frase do yt-dlp traduzida pro que a pessoa precisa saber. */
function explicarErro(bruto: string): string {
  const t = bruto.toLowerCase()
  if (t.includes('sign in to confirm your age') || t.includes('age-restricted')) {
    return 'Esse vídeo tem restrição de idade e o YouTube pede login pra baixar.'
  }
  if (t.includes('private video')) return 'Esse vídeo é privado.'
  if (
    t.includes('video unavailable') ||
    t.includes('video is unavailable') ||
    t.includes('this video is not available')
  ) {
    return 'Vídeo indisponível (removido, privado ou bloqueado na sua região).'
  }
  if (t.includes('unsupported url') || t.includes('is not a valid url')) {
    return 'Esse link não é de um site de onde dê pra baixar.'
  }
  if (t.includes('sign in to confirm you') && t.includes('bot')) {
    return 'O YouTube pediu pra confirmar que não é robô. Tente de novo daqui a pouco.'
  }
  if (/http error 4\d\d/.test(t)) {
    return 'Esse link não abre: a página não existe ou não tem vídeo.'
  }
  if (t.includes('timed out') || t.includes('getaddrinfo') || t.includes('connection')) {
    return 'Não deu pra falar com o site — confira a internet.'
  }
  // O resto vai como veio (em inglês), mas com o "[site] id:" de fora.
  const linha = bruto.replace(/^ERROR:\s*/i, '').replace(/^\[[^\]]+\]\s*[^:]*:\s*/, '').trim()
  return linha ? `O download falhou: ${linha}` : 'O download falhou.'
}

/** O critério de qualidade. `-S` ordena em vez de filtrar: se não houver
 *  H.264 em 1080p, ele cai pro melhor que houver em vez de falhar. */
function ordemDeQualidade(q: QualidadeDownload): string {
  // H.264 + AAC antes de tudo: é o que o DaVinci abre liso.
  // No máximo (4K), o YouTube só tem VP9 e AV1; o AV1 o DaVinci abre.
  return q === 'max' ? 'res,fps,vcodec:av01,acodec:aac' : 'res:1080,fps,vcodec:h264,acodec:aac'
}

export class Baixador {
  private preparando: Promise<{ ytdlp: string; deno: string }> | null = null
  private atual: ChildProcess | null = null
  private cancelado = false

  constructor(private readonly emitir: (evento: EventoLink) => void) {}

  /** yt-dlp e Deno prontos (baixa na primeira vez; atualiza 1x por dia). */
  private ferramentas(): Promise<{ ytdlp: string; deno: string }> {
    this.preparando ??= this.preparar().finally(() => {
      this.preparando = null
    })
    return this.preparando
  }

  private async preparar(): Promise<{ ytdlp: string; deno: string }> {
    const pasta = pastaDasFerramentas()
    await mkdir(pasta, { recursive: true })
    const ytdlp = join(pasta, 'yt-dlp.exe')
    const deno = join(pasta, 'deno.exe')

    if (!existsSync(ytdlp)) {
      this.emitir({ tipo: 'ferramenta', mensagem: 'Baixando o yt-dlp (só na primeira vez)…', fracao: 0 })
      await baixarArquivo(YTDLP_URL, ytdlp, (f) =>
        this.emitir({ tipo: 'ferramenta', mensagem: 'Baixando o yt-dlp (só na primeira vez)…', fracao: f })
      )
      await writeFile(join(pasta, '.ultima-atualizacao'), String(Date.now()))
    } else {
      await this.atualizarSePreciso(ytdlp, pasta)
    }

    if (!existsSync(deno)) {
      const zip = join(pasta, 'deno.zip')
      const msg = 'Baixando o Deno, que o YouTube exige (só na primeira vez)…'
      this.emitir({ tipo: 'ferramenta', mensagem: msg, fracao: 0 })
      await baixarDeAlgum(await enderecosDoDeno(), zip, (f) =>
        this.emitir({ tipo: 'ferramenta', mensagem: msg, fracao: f })
      )
      // O tar do Windows (10 em diante) abre zip; evita uma dependência só
      // pra isso.
      const tar = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe')
      await rodarSimples(tar, ['-xf', zip, '-C', pasta], 120_000)
      await rm(zip, { force: true })
      if (!existsSync(deno)) throw new Error('O Deno não veio no pacote baixado.')
    }
    return { ytdlp, deno }
  }

  /** `yt-dlp -U` no máximo uma vez por dia. Falhar aqui não impede baixar:
   *  a versão que já está aqui provavelmente ainda funciona. */
  private async atualizarSePreciso(ytdlp: string, pasta: string): Promise<void> {
    const marca = join(pasta, '.ultima-atualizacao')
    let ultima = 0
    try {
      ultima = Number(await readFile(marca, 'utf8')) || 0
    } catch {
      ultima = 0
    }
    if (Date.now() - ultima < UM_DIA_MS) return
    this.emitir({ tipo: 'ferramenta', mensagem: 'Atualizando o yt-dlp…', fracao: -1 })
    try {
      await rodarSimples(ytdlp, ['-U'], 120_000)
    } catch {
      // sem internet ou GitHub fora: segue com a versão atual
    }
    await writeFile(marca, String(Date.now()))
  }

  private argsComuns(deno: string): string[] {
    const args = ['--ignore-config', '--color', 'never', '--js-runtimes', `deno:${deno}`]
    const ffmpeg = ferramenta('ffmpeg')
    // `ffmpeg` sozinho = o do PATH, que o yt-dlp já acha sem ajuda.
    if (ffmpeg !== 'ffmpeg') args.push('--ffmpeg-location', ffmpeg)
    return args
  }

  /**
   * Roda o yt-dlp linha a linha. Devolve o código de saída e a última linha
   * de erro. O ambiente força UTF-8: título com acento ou emoji chegava
   * quebrado no código de página do console.
   */
  private rodar(
    exe: string,
    args: string[],
    aoLer: (linha: string) => void
  ): Promise<{ codigo: number; erro: string }> {
    return new Promise((ok) => {
      const filho = spawn(exe, args, {
        windowsHide: true,
        env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
      })
      this.atual = filho
      let erro = ''
      let sobra = ''
      filho.stdout.setEncoding('utf8')
      filho.stdout.on('data', (pedaco: string) => {
        sobra += pedaco
        const linhas = sobra.split(/\r?\n/)
        sobra = linhas.pop() ?? ''
        for (const l of linhas) if (l.trim()) aoLer(l.trim())
      })
      filho.stderr.setEncoding('utf8')
      filho.stderr.on('data', (pedaco: string) => {
        for (const l of pedaco.split(/\r?\n/)) {
          if (/^ERROR:/i.test(l.trim())) erro = l.trim()
        }
      })
      filho.on('error', (e) => {
        erro = e.message
      })
      filho.on('close', (codigo) => {
        if (sobra.trim()) aoLer(sobra.trim())
        this.atual = null
        ok({ codigo: codigo ?? 1, erro })
      })
    })
  }

  /** O que tem no link: um vídeo, ou todos os de uma playlist. */
  async listar(url: string): Promise<{ itens: VideoDoLink[]; erro?: string }> {
    try {
      const { ytdlp, deno } = await this.ferramentas()
      const itens: VideoDoLink[] = []
      const r = await this.rodar(
        ytdlp,
        [
          ...this.argsComuns(deno),
          '--no-warnings',
          '--flat-playlist',
          // Link de vídeo que veio de dentro de uma playlist ("&list=…"): é
          // o vídeo que a pessoa quer, não a playlist inteira.
          '--no-playlist',
          // `j` sem `+` escapa acento como \u00e7: a linha chega inteira
          // mesmo se o console trocar o código de página.
          '--print',
          '%(.{id,title,webpage_url,url,duration})j',
          url
        ],
        (linha) => {
          try {
            const v = JSON.parse(linha) as Record<string, unknown>
            const pagina = String(v['webpage_url'] ?? '')
            const direto = String(v['url'] ?? '')
            itens.push({
              id: String(v['id'] ?? ''),
              titulo: String(v['title'] ?? v['id'] ?? 'Vídeo'),
              // Na playlist "achatada" o `url` é a página do vídeo; num vídeo
              // só, é o endereço do arquivo — por isso a página vem primeiro.
              url: pagina || direto,
              duracao: Number(v['duration'] ?? 0) || 0
            })
          } catch {
            // linha que não é do nosso --print (aviso solto): ignora
          }
        }
      )
      if (itens.length === 0) {
        return { itens, erro: explicarErro(r.erro || 'Nenhum vídeo nesse link.') }
      }
      return { itens }
    } catch (e) {
      return { itens: [], erro: e instanceof Error ? e.message : String(e) }
    }
  }

  async baixar(pedido: PedidoDownload): Promise<ResultadoDownload | { erro: string }> {
    if (this.atual) return { erro: 'Já tem um download em andamento.' }
    this.cancelado = false
    try {
      const { ytdlp, deno } = await this.ferramentas()
      await mkdir(pedido.pasta, { recursive: true })

      const trecho = (pedido.inicio ?? 0) > 0 || (pedido.fim ?? 0) > 0
      const args = [
        ...this.argsComuns(deno),
        '--no-warnings',
        '--no-playlist',
        '--newline',
        '--progress',
        '--progress-template',
        'download:ANCUT-P %(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
        '--print',
        'before_dl:ANCUT-I %(.{id,title,webpage_url})j',
        '--print',
        'after_move:ANCUT-F %(filepath)j',
        // `--print` sozinho só simularia.
        '--no-simulate',
        '-f',
        'bv*+ba/b',
        '-S',
        ordemDeQualidade(pedido.qualidade),
        '--merge-output-format',
        'mp4',
        '-P',
        pedido.pasta,
        '-o',
        trecho
          ? '%(title).100B [%(id)s] trecho %(section_start)d-%(section_end)d.%(ext)s'
          : '%(title).120B [%(id)s].%(ext)s',
        '--windows-filenames',
        '--no-mtime'
      ]
      if (trecho) {
        const fim = (pedido.fim ?? 0) > 0 ? String(pedido.fim) : 'inf'
        args.push('--download-sections', `*${pedido.inicio ?? 0}-${fim}`)
      }
      args.push(pedido.url)

      let titulo = ''
      let origem = pedido.url
      let arquivo = ''
      let parte = 0
      let ultimo = 0
      const r = await this.rodar(ytdlp, args, (linha) => {
        if (linha.startsWith('ANCUT-I ')) {
          try {
            const v = JSON.parse(linha.slice(8)) as Record<string, unknown>
            titulo = String(v['title'] ?? '')
            origem = String(v['webpage_url'] ?? '') || origem
          } catch {
            /* segue sem o título: cai no nome do arquivo */
          }
        } else if (linha.startsWith('ANCUT-F ')) {
          try {
            arquivo = String(JSON.parse(linha.slice(8)))
          } catch {
            arquivo = linha.slice(8).replace(/^"|"$/g, '')
          }
        } else if (linha.startsWith('ANCUT-P ')) {
          const [pct, vel, falta] = linha.slice(8).split('|')
          const f = Number.parseFloat(pct) / 100
          if (!Number.isFinite(f)) {
            // trecho (o ffmpeg baixa sem porcentagem): progresso sem número
            this.emitir({ tipo: 'progresso', fracao: -1, velocidade: (vel ?? '').trim(), falta: '', fase: 'video' })
            return
          }
          // Vídeo e áudio vêm separados e cada um conta de 0 a 100%: quando
          // a porcentagem despenca, começou a segunda parte.
          if (f < ultimo - 0.3) parte += 1
          ultimo = f
          const fracao = parte === 0 ? f * 0.9 : 0.9 + f * 0.1
          const fase = f >= 0.999 && parte >= 1 ? 'juntando' : parte === 0 ? 'video' : 'audio'
          this.emitir({
            tipo: 'progresso',
            fracao,
            velocidade: (vel ?? '').trim(),
            falta: (falta ?? '').trim(),
            fase
          })
        }
      })
      if (this.cancelado) return { erro: 'Cancelado.' }
      if (r.codigo !== 0 || !arquivo) return { erro: explicarErro(r.erro) }
      return { arquivo, titulo: titulo || nomeSemId(arquivo), origem }
    } catch (e) {
      return { erro: e instanceof Error ? e.message : String(e) }
    }
  }

  /** Para o download. O yt-dlp abre ffmpeg por baixo, então vai a árvore. */
  cancelar(): void {
    const filho = this.atual
    if (!filho?.pid) return
    this.cancelado = true
    execFile('taskkill', ['/PID', String(filho.pid), '/T', '/F'], { windowsHide: true }, () => {})
  }
}

/** "Official Trailer [abc123def45].mp4" → "Official Trailer". */
function nomeSemId(arquivo: string): string {
  const nome = arquivo.split(/[\\/]/).pop() ?? arquivo
  return nome.replace(/\s*\[[^\]]+\].*$/, '').replace(/\.[^.]+$/, '')
}
