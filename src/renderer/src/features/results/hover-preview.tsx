import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** Espera antes de começar a tocar, em ms. */
const ATRASO = 260

/**
 * Miniatura que vira prévia animada quando o mouse para em cima.
 *
 * O keyframe é uma foto de um instante da cena, e um instante mente: numa
 * grade de 400 cenas, metade dos cards mostra alguém de olho fechado ou de
 * costas. Ver a cena andar é o que responde "é esta?" sem ter que clicar em
 * cada uma.
 *
 * Três decisões que fazem isto não custar caro:
 *
 * - **`preload="none"` e `src` só depois do atraso.** Sem isso, atravessar a
 *   grade com o mouse deixaria uma trilha de vídeos carregando — cada card
 *   tocado de passagem abriria um arquivo. Com o atraso, só o card onde o
 *   mouse realmente parou chega a abrir alguma coisa.
 * - **A imagem NUNCA sai da tela.** Ela fica embaixo do vídeo o tempo todo.
 *   Trocar um pelo outro daria um pisca preto na largada, e é justamente na
 *   largada que o olho está olhando.
 * - **Mudo e em loop.** São clipes de 2 a 8 segundos e o uso é varrer a
 *   grade; som aqui seria um susto, não informação.
 */
export function HoverPreview({
  thumb,
  clip,
  className
}: {
  thumb: string | null
  /** URL media:// do clipe. Sem ela o card continua sendo só a foto. */
  clip: string | null
  className?: string
}): JSX.Element {
  const [armado, setArmado] = useState(false)
  const [tocando, setTocando] = useState(false)
  const timer = useRef<number | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const cancelar = (): void => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }

  // Desmontar com o timer armado (rolar a lista, trocar de personagem)
  // dispararia um `setState` num componente que já não existe.
  useEffect(() => cancelar, [])

  const entrar = (): void => {
    if (!clip || armado) return
    cancelar()
    timer.current = window.setTimeout(() => setArmado(true), ATRASO)
  }

  const sair = (): void => {
    cancelar()
    setArmado(false)
    setTocando(false)
    // Solta o decodificador na saída. Um <video> montado guarda buffer e um
    // decodificador de hardware; com a grade cheia, os que ficassem pra trás
    // acabariam com o limite do Chromium e os próximos não tocariam mais.
    const v = videoRef.current
    if (v) {
      v.pause()
      v.removeAttribute('src')
      v.load()
    }
  }

  return (
    <div
      className={cn('relative size-full overflow-hidden', className)}
      onPointerEnter={entrar}
      onPointerLeave={sair}
    >
      {thumb ? (
        <img
          src={thumb}
          alt=""
          loading="lazy"
          draggable={false}
          className={cn(
            'size-full object-cover transition-transform duration-200',
            !tocando && 'group-hover:scale-[1.03]'
          )}
        />
      ) : (
        <div className="grid size-full place-items-center text-[11px] text-muted-foreground">
          sem keyframe
        </div>
      )}

      {armado && clip && (
        <video
          ref={videoRef}
          src={clip}
          muted
          loop
          playsInline
          autoPlay
          preload="none"
          // `draggable={false}`: o arrasto pertence ao CARD, que sabe levar o
          // arquivo de verdade pro Windows. Deixar o vídeo capturar o gesto
          // faria o card virar inarrastável só por estar em prévia.
          draggable={false}
          onPlaying={() => setTocando(true)}
          // Se o clipe não abrir (arquivo movido pelo Explorer, codec que o
          // Chromium recusa), some sem alarde: a foto embaixo continua lá e o
          // card não fica preto.
          onError={sair}
          className={cn(
            'absolute inset-0 size-full object-cover transition-opacity duration-150',
            tocando ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}

      {/* Selo discreto de que aquilo é a cena andando, não a foto.
          Embaixo à esquerda porque os outros três cantos já têm dono e todos
          aparecem no mesmo gesto: marcar (cima-esq), favoritar (cima-dir) e a
          confiança (baixo-dir). */}
      {tocando && (
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white/90">
          prévia
        </span>
      )}
    </div>
  )
}
