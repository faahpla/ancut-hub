import { ExternalLink, FolderOpen, Pause, Play, Repeat, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { diskPath, mediaUrl, useResultsStore } from '@/stores/results-store'

/**
 * Player da prévia. Um `<video>` do HTML5 — sem plugin de mídia pra empacotar,
 * sem cálculo manual de 16:9, e o scrubber é um <input range> comum.
 *
 * Padrões vindos da versão Qt: começa MUDO e em LOOP (as cenas são curtas e o
 * uso é revisar rápido).
 */
export function PreviewPlayer(): JSX.Element {
  const { activeShot, mediaPrefix, results } = useResultsStore()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [loop, setLoop] = useState(true)
  const [volume, setVolume] = useState(0.8)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  /**
   * Está com o dedo na barra AGORA.
   *
   * O `<video>` avisa a posição uma 4x por segundo, e esse aviso mandava no
   * valor da barra — então, no meio do arrasto, o quadro que o vídeo ainda
   * estava exibindo puxava o marcador de volta. Enquanto o dedo está na
   * barra, quem manda é o dedo.
   *
   * Ref, e não estado: o aviso do vídeo chega por um manipulador criado numa
   * renderização anterior, e ele leria o valor congelado daquela vez.
   */
  const arrastando = useRef(false)
  /** Estava tocando quando o arrasto começou (pra retomar ao soltar). */
  const retomar = useRef(false)

  /**
   * Pegar a barra PAUSA; soltar retoma se estava tocando.
   *
   * Este é o bug de verdade que o usuário relatou como "arrasto a barra e
   * volta pro início". O seek nunca esteve quebrado — as cenas têm 2 a 8
   * segundos e o player abre em LOOP. Arrastar pro segundo 4,8 de um clipe
   * de 5 acertava em cheio, o clipe acabava 200ms depois e o loop devolvia
   * pro zero. Medido: seek pra 1,98s num clipe de 2,23s, e 400ms depois o
   * vídeo estava em 0,02s.
   *
   * Parar enquanto o dedo está na barra é o que qualquer editor de vídeo faz,
   * e resolve pela raiz: o quadro fica parado onde você largou, dando tempo
   * de olhar. O loop continua existindo — só não atropela mais o gesto.
   */
  const iniciarArrasto = (): void => {
    const v = videoRef.current
    if (!v || arrastando.current) return
    arrastando.current = true
    retomar.current = !v.paused
    v.pause()
  }

  const terminarArrasto = (): void => {
    if (!arrastando.current) return
    arrastando.current = false
    if (retomar.current) {
      retomar.current = false
      void videoRef.current?.play().catch(() => {
        /* sem autoplay o botão continua ali */
      })
    }
  }

  const src = mediaUrl(mediaPrefix, activeShot?.file ?? null)
  /** Caminho no disco — o media:// serve pro <video>, não pro Windows. */
  const arquivo = diskPath(results?.episodeRoot ?? '', activeShot?.file ?? null)

  // Fonte nova: volta pro início e toca (a cena selecionada deve animar
  // sozinha, é o comportamento de "prévia" que o usuário espera).
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return
    v.currentTime = 0
    setPosition(0)
    // Zera a duração junto: mantê-la faria a barra do clipe novo abrir com a
    // régua do clipe anterior, e arrastar antes dos metadados chegarem
    // apontaria pra um segundo que talvez nem exista neste.
    setDuration(0)
    arrastando.current = false
    void v.play().catch(() => {
      /* autoplay pode ser negado; o botão continua disponível */
    })
  }, [src])

  useEffect(() => {
    const v = videoRef.current
    if (v) v.volume = volume
  }, [volume])

  // Soltar o botão do mouse é ouvido na JANELA, não na barra.
  //
  // Arrastar até o fim e soltar com o ponteiro já fora da barra é o gesto
  // normal, e nesse caso o `pointerup` não passa pelo input. Preso em
  // `arrastando`, o marcador ignoraria o vídeo pelo resto da sessão.
  useEffect(() => {
    const soltar = (): void => terminarArrasto()
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
    return () => {
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (): void => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }

  const seek = (value: number): void => {
    const v = videoRef.current
    if (!v) return
    // Limitado à duração de verdade: um clipe de 5s com `max` errado aceitaria
    // 9s, e o vídeo trata posição fora do fim voltando pro zero.
    const alvo = Math.min(Math.max(0, value), duration || 0)
    v.currentTime = alvo
    setPosition(alvo)
  }

  /**
   * A duração só é confiável quando for um número finito e positivo.
   *
   * Em clipe recém-aberto ela chega como `NaN`, e a primeira versão disto
   * escrevia `max={duration || 0}` — barra de 0 a 0. Qualquer arrasto ali
   * resolve pra 0, que é exatamente "voltou pro início".
   */
  const pronto = Number.isFinite(duration) && duration > 0
  const anotarDuracao = (v: HTMLVideoElement): void => {
    setDuration(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0)
  }

  return (
    <div className="panel flex min-h-0 flex-col gap-2.5 overflow-hidden p-3">
      <h2 className="truncate text-[13px] font-semibold text-muted-foreground">
        {/* Sem confiança na visão de todas as cenas: ela pertence ao par
            (cena, personagem), e ali a cena pode ter vários ou nenhum. */}
        {activeShot
          ? `#${String(activeShot.idx).padStart(4, '0')}` +
            (activeShot.confidence !== null
              ? ` · confiança ${activeShot.confidence.toFixed(2)}`
              : ` · ${activeShot.duration.toFixed(1)}s`)
          : 'Prévia'}
      </h2>

      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
        {src ? (
          <video
            ref={videoRef}
            src={src}
            muted={muted}
            loop={loop}
            playsInline
            draggable
            // Arrastar daqui pra fora, igual à grade: quando você já está
            // assistindo é onde a vontade de tirar o clipe aparece.
            onDragStart={(e) => {
              e.preventDefault()
              if (arquivo) {
                window.ancut.shell.startDrag(
                  [arquivo],
                  diskPath(results?.episodeRoot ?? '', activeShot?.keyframe ?? null)
                )
              }
            }}
            className="size-full cursor-grab object-contain active:cursor-grabbing"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => {
              if (!arrastando.current) setPosition(e.currentTarget.currentTime)
            }}
            // `seeked` mesmo arrastando: é a confirmação de que o vídeo
            // chegou onde foi mandado, e sem ela o marcador ficaria adivinhando.
            onSeeked={(e) => setPosition(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => anotarDuracao(e.currentTarget)}
            // Em MP4 gravado em streaming a duração só aparece depois dos
            // metadados; sem escutar isto a barra ficava morta nesses clipes.
            onDurationChange={(e) => anotarDuracao(e.currentTarget)}
            onClick={toggle}
          />
        ) : (
          <div className="grid size-full place-items-center text-[12px] text-muted-foreground">
            Selecione uma cena
          </div>
        )}
      </div>

      {/* Scrubber ocupando a largura toda; transporte embaixo.
          A altura é 12px pra ter onde pegar, mas o trilho desenhado continua
          com 6px — a área de clique cresce sem a barra engordar. */}
      <input
        type="range"
        min={0}
        max={pronto ? duration : 1}
        step={0.02}
        value={position}
        disabled={!src || !pronto}
        onPointerDown={iniciarArrasto}
        onKeyDown={iniciarArrasto}
        onKeyUp={terminarArrasto}
        onChange={(e) => seek(Number(e.target.value))}
        style={
          {
            '--pct': `${pronto ? (position / duration) * 100 : 0}%`
          } as React.CSSProperties
        }
        className={cn(
          'h-3 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-default disabled:opacity-40',
          '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full',
          '[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,hsl(var(--primary))_var(--pct),hsl(var(--muted))_var(--pct))]',
          '[&::-webkit-slider-thumb]:mt-[-3px] [&::-webkit-slider-thumb]:size-3',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
          '[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow'
        )}
      />

      <div className="flex items-center gap-1.5">
        <Button
          variant="primary"
          size="icon"
          className="rounded-full"
          disabled={!src}
          onClick={toggle}
          title="Play / Pause"
        >
          {playing ? <Pause /> : <Play />}
        </Button>

        <span className="tabular text-[11.5px] font-medium text-muted-foreground">
          {fmt(position)} / {fmt(duration)}
        </span>

        <span className="flex-1" />

        <IconToggle
          on={loop}
          onClick={() => setLoop((v) => !v)}
          title="Repetir em loop"
        >
          <Repeat />
        </IconToggle>

        <IconToggle
          on={false}
          onClick={() => setMuted((v) => !v)}
          title={muted ? 'Ativar som' : 'Mudo'}
        >
          {muted ? <VolumeX /> : <Volume2 />}
        </IconToggle>

        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          title="Volume"
          className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-muted accent-muted-foreground"
        />

        <IconToggle
          on={false}
          disabled={!arquivo}
          onClick={() => arquivo && void window.ancut.shell.reveal(arquivo)}
          title="Ir para a pasta"
        >
          <FolderOpen />
        </IconToggle>

        <IconToggle
          on={false}
          disabled={!arquivo}
          onClick={() => arquivo && void window.ancut.shell.open(arquivo)}
          title="Abrir no player do sistema"
        >
          <ExternalLink />
        </IconToggle>
      </div>
    </div>
  )
}

function IconToggle({
  on,
  children,
  onClick,
  title,
  disabled
}: {
  on: boolean
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'grid size-8 place-items-center rounded-full border transition-colors',
        '[&_svg]:size-[15px] disabled:opacity-40',
        on
          ? 'border-primary/60 bg-primary/10 text-primary'
          : 'border-transparent text-muted-foreground hover:border-border hover:bg-surface-hover hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00'
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
