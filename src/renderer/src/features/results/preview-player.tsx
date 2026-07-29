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
    void v.play().catch(() => {
      /* autoplay pode ser negado; o botão continua disponível */
    })
  }, [src])

  useEffect(() => {
    const v = videoRef.current
    if (v) v.volume = volume
  }, [volume])

  const toggle = (): void => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }

  const seek = (value: number): void => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = value
    setPosition(value)
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
            onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onClick={toggle}
          />
        ) : (
          <div className="grid size-full place-items-center text-[12px] text-muted-foreground">
            Selecione uma cena
          </div>
        )}
      </div>

      {/* Scrubber ocupando a largura toda; transporte embaixo. */}
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.02}
        value={position}
        disabled={!src}
        onChange={(e) => seek(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:opacity-40"
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
