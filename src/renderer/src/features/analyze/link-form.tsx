import { Check, Film, Link2, Loader2, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { cn, tituloSemAnime } from '@/lib/utils'
import { useAnalysisStore } from '@/stores/analysis-store'
import { parseMmss, useEpisodeStore } from '@/stores/episode-store'
import { useQueueStore } from '@/stores/queue-store'
import type { QualidadeDownload, VideoDoLink } from '@shared/types'

const QUALIDADES: { valor: QualidadeDownload; rotulo: string; dica: string }[] = [
  { valor: '1080', rotulo: 'Até 1080p', dica: 'MP4 em H.264: abre liso no DaVinci. O recomendado.' },
  { valor: 'max', rotulo: 'Máxima (4K)', dica: 'A maior que o vídeo tiver. Em 4K o YouTube só manda AV1/VP9: arquivo maior e mais pesado de editar.' }
]

/** "1:02:03" a partir de segundos. */
function duracao(s: number): string {
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = Math.floor(s % 60)
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(ss).padStart(2, '0')}`
}

/**
 * Baixar B-roll por link: trailer, gameplay, teaser.
 *
 * Cola o link (ou vários, ou uma playlist), confere o que veio, diz de que
 * título é, e o app baixa e corta pela fila — sempre "Só cortar": B-roll é
 * material de edição, e o corte certo já sai sozinho (o app escolhe o jeito
 * anime ou filme olhando o vídeo). Reconhecer personagem, se quiser, é
 * depois, no episódio aberto.
 */
export function LinkForm({ disabled }: { disabled: boolean }): JSX.Element {
  const ep = useEpisodeStore()
  const filaRodando = useQueueStore((s) => s.rodando)
  const [texto, setTexto] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [preparo, setPreparo] = useState('')
  const [videos, setVideos] = useState<VideoDoLink[] | null>(null)
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState('')
  const [anime, setAnime] = useState('')
  const [pastas, setPastas] = useState<string[]>([])
  const [qualidade, setQualidade] = useState<QualidadeDownload>('1080')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [feito, setFeito] = useState('')

  // As pastas que já existem na saída: é delas que sai a sugestão de "De que é".
  useEffect(() => {
    void window.ancut.episode.animeFolder('_').then((r) => r && setPastas(r.existing))
  }, [])

  // Na primeira vez o app baixa o yt-dlp e o Deno: sem isto a busca parece
  // travada por um minuto.
  useEffect(() => {
    if (!buscando) return
    return window.ancut.link.onEvento((ev) => {
      if (ev.tipo === 'ferramenta') {
        setPreparo(`${ev.mensagem}${ev.fracao >= 0 ? ` ${Math.round(ev.fracao * 100)}%` : ''}`)
      }
    })
  }, [buscando])

  const buscar = async (): Promise<void> => {
    const links = texto.split(/\s+/).map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l))
    if (links.length === 0) {
      setErro('Cole um link que comece com http.')
      return
    }
    setBuscando(true)
    setErro('')
    setFeito('')
    setPreparo('')
    try {
      const achados: VideoDoLink[] = []
      const falhas: string[] = []
      for (const l of links) {
        const r = await window.ancut.link.listar(l)
        if (r.erro && r.itens.length === 0) falhas.push(r.erro)
        for (const v of r.itens) if (!achados.some((a) => a.url === v.url)) achados.push(v)
      }
      if (achados.length === 0) {
        setErro(falhas[0] ?? 'Nenhum vídeo nesse link.')
        return
      }
      if (falhas.length) setErro(`${falhas.length} link(s) não abriram: ${falhas[0]}`)
      setVideos(achados)
      setEscolhidos(new Set(achados.map((v) => v.url)))
      // Palpite de "De que é": a pasta existente mais longa que abre o título
      // ("Cyberpunk 2077 — Trailer…" → Cyberpunk 2077, não Cyberpunk Edgerunners).
      if (!anime) {
        const t = achados[0].titulo.toLowerCase()
        const palpite = [...pastas]
          .filter((p) => t.startsWith(p.toLowerCase()))
          .sort((a, b) => b.length - a.length)[0]
        if (palpite) setAnime(palpite)
      }
    } finally {
      setBuscando(false)
      setPreparo('')
    }
  }

  const limpar = (): void => {
    setVideos(null)
    setTexto('')
    setErro('')
    setInicio('')
    setFim('')
  }

  const selecionados = useMemo(
    () => (videos ?? []).filter((v) => escolhidos.has(v.url)),
    [videos, escolhidos]
  )
  const umSo = (videos?.length ?? 0) === 1

  const baixar = async (): Promise<void> => {
    if (!anime.trim()) {
      setErro('Diga de que é (o título onde o B-roll vai morar).')
      return
    }
    if (!ep.outputDir.trim()) {
      setErro('Escolha a pasta de saída (no cartão do arquivo ou nas Configurações).')
      return
    }
    const r = await window.ancut.episode.animeFolder(anime.trim())
    const pastaAnime = r?.folder || anime.trim()
    const sep = ep.outputDir.includes('/') && !ep.outputDir.includes('\\') ? '/' : '\\'
    const base = ep.outputDir.replace(/[\\/]+$/, '')
    const q = useQueueStore.getState()
    q.adicionarLinks(selecionados, {
      anime: anime.trim(),
      pastaAnime,
      pasta: `${base}${sep}${pastaAnime}${sep}Baixados`,
      qualidade,
      inicio: umSo && inicio.trim() ? parseMmss(inicio) : undefined,
      fim: umSo && fim.trim() ? parseMmss(fim) : undefined
    })
    setFeito(
      `${selecionados.length} ${selecionados.length === 1 ? 'vídeo foi' : 'vídeos foram'} pra fila — vão pra aba B-roll de “${pastaAnime}”.`
    )
    limpar()
    // Com um corte avulso rodando, a fila espera: os dois usariam o mesmo
    // motor. Ela começa pelo botão dela quando o corte acabar.
    if (!q.rodando && useAnalysisStore.getState().status !== 'running') void q.iniciar()
  }

  if (!videos) {
    return (
      <section className="panel flex flex-col gap-2.5 p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-elevated text-muted-foreground">
            <Link2 className="size-[18px]" />
          </span>
          <input
            value={texto}
            disabled={disabled || buscando}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void buscar()}
            onPaste={(e) => {
              // Colou e pronto: buscar já, sem precisar de mais um clique.
              const colado = e.clipboardData.getData('text')
              if (/^https?:\/\//i.test(colado.trim()) && !texto.trim()) {
                e.preventDefault()
                setTexto(colado.trim())
                window.setTimeout(() => document.getElementById('buscar-link')?.click(), 0)
              }
            }}
            placeholder="Ou cole um link — YouTube, Twitter/X, Twitch… (trailer, gameplay, teaser vira B-roll)"
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface-sunken px-3 text-[13.5px] outline-none placeholder:text-muted-foreground/70 focus:border-primary/60 disabled:opacity-60"
          />
          <Button
            id="buscar-link"
            size="md"
            variant="secondary"
            className="shrink-0 gap-1.5"
            disabled={disabled || buscando || !texto.trim()}
            onClick={() => void buscar()}
          >
            {buscando ? <Loader2 className="animate-spin" /> : <Search />}
            Buscar
          </Button>
        </div>
        {buscando && (
          <p className="flex items-center gap-2 pl-12 text-[12.5px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {preparo || 'Lendo o link…'}
          </p>
        )}
        {erro && <p className="pl-12 text-[12.5px] text-warning">{erro}</p>}
        {feito && (
          <p className="flex items-center gap-1.5 pl-12 text-[12.5px] text-primary">
            <Check className="size-3.5" />
            {feito}
          </p>
        )}
      </section>
    )
  }

  return (
    <article className="panel flex flex-col gap-4 p-5">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <Film className="size-6" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-[20px] font-bold leading-tight">
            {umSo ? 'B-roll do link' : `${videos.length} vídeos no link`}
          </h2>
          <p className="text-[12.5px] text-muted-foreground">
            Baixa, guarda o vídeo e corta em cenas. Vai pra aba B-roll do título.
          </p>
        </div>
        <Button size="sm" variant="ghost" className="gap-1" onClick={limpar}>
          <X />
          Trocar link
        </Button>
      </div>

      <ul className={cn('flex flex-col gap-1', !umSo && 'max-h-[260px] overflow-y-auto pr-1')}>
        {videos.map((v) => {
          const marcado = escolhidos.has(v.url)
          return (
            <li key={v.url}>
              <label
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px]',
                  marcado ? 'border-border bg-surface-sunken/60' : 'border-border/50 opacity-60',
                  !umSo && 'cursor-pointer'
                )}
              >
                {!umSo && (
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() =>
                      setEscolhidos((a) => {
                        const n = new Set(a)
                        if (n.has(v.url)) n.delete(v.url)
                        else n.add(v.url)
                        return n
                      })
                    }
                    className="size-4 shrink-0 accent-primary"
                  />
                )}
                <span className="min-w-0 flex-1 truncate font-medium" title={v.titulo}>
                  {anime ? tituloSemAnime(v.titulo, anime) : v.titulo}
                </span>
                {v.duracao > 0 && (
                  <span className="shrink-0 tabular text-[12px] text-muted-foreground">{duracao(v.duracao)}</span>
                )}
              </label>
            </li>
          )
        })}
      </ul>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Field label="De que é">
          <Input
            value={anime}
            list="pastas-do-link"
            placeholder="Ex.: Cyberpunk 2077"
            onChange={(e) => setAnime(e.target.value)}
          />
          <datalist id="pastas-do-link">
            {pastas.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="Qualidade">
          <div className="inline-flex w-full gap-1 rounded-lg border border-border bg-surface-sunken/80 p-1">
            {QUALIDADES.map((o) => (
              <button
                key={o.valor}
                type="button"
                title={o.dica}
                aria-pressed={qualidade === o.valor}
                onClick={() => setQualidade(o.valor)}
                className={cn(
                  'h-8 flex-1 whitespace-nowrap rounded-md px-3 text-[13px] font-semibold transition-colors',
                  qualidade === o.valor ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {umSo && (
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-semibold">
            Só um trecho? <span className="font-normal text-muted-foreground">(vazio = o vídeo inteiro)</span>
          </span>
          <div className="grid grid-cols-2 gap-3 sm:max-w-[360px]">
            <Field label="De">
              <Input value={inicio} placeholder="ex.: 12:30" onChange={(e) => setInicio(e.target.value)} />
            </Field>
            <Field label="Até">
              <Input value={fim} placeholder="ex.: 18:00" onChange={(e) => setFim(e.target.value)} />
            </Field>
          </div>
        </div>
      )}

      {erro && <p className="text-[12.5px] text-warning">{erro}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {filaRodando && (
          <span className="mr-auto text-[12.5px] text-muted-foreground">
            A fila está rodando — estes entram no fim dela.
          </span>
        )}
        <Button
          variant="primary"
          size="lg"
          className="gap-1.5"
          disabled={selecionados.length === 0}
          onClick={() => void baixar()}
        >
          <Film />
          {selecionados.length === 1 ? 'Baixar e cortar' : `Baixar e cortar ${selecionados.length} vídeos`}
        </Button>
      </div>
    </article>
  )
}
