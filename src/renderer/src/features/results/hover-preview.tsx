import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** Espera antes de começar a tocar, em ms. */
const ATRASO = 260
/** Quanto o mouse precisa andar dentro do card pra virar comando, em px. */
const LIMIAR = 10

const entre = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

/**
 * Miniatura que vira prévia animada quando o mouse para em cima — e que o
 * mouse GUIA quando ele anda.
 *
 * O keyframe é uma foto de um instante da cena, e um instante mente: numa
 * grade de 400 cenas, metade dos cards mostra alguém de olho fechado ou de
 * costas. Ver a cena andar é o que responde "é esta?" sem ter que clicar em
 * cada uma.
 *
 * Dois modos, e o mouse escolhe qual sozinho:
 *
 * - **Parado, ela toca.** Chegou e ficou: a cena roda em loop, do jeito que
 *   ela é.
 * - **Andando, ela obedece.** A posição do mouse na largura do card vira a
 *   posição no clipe — esquerda é o começo, direita é o fim. Serve pra achar
 *   O instante: um clipe de 8s leva 8s pra ser visto assistindo, e nenhum
 *   varrendo com o mouse.
 *
 * O limiar de 10px é o que separa um gesto do outro. Sem ele, o tranco de
 * entrar no card já jogaria a cena pro meio antes de tocar um quadro.
 *
 * Três decisões que fazem isto não custar caro:
 *
 * - **O `<video>` só nasce depois do atraso.** Sem isso, atravessar a grade
 *   com o mouse deixaria uma trilha de vídeos carregando — cada card tocado
 *   de passagem abriria um arquivo. Com o atraso, só o card onde o mouse
 *   realmente parou chega a abrir alguma coisa.
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
  const [guiando, setGuiando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const timer = useRef<number | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  /** Onde o mouse entrou, pra medir se ele andou ou só tremeu. */
  const origem = useRef<number | null>(null)
  /** Posição pedida que ainda não deu pra aplicar (o vídeo estava buscando). */
  const pendente = useRef<number | null>(null)
  /**
   * O mesmo que `guiando`, em ref.
   *
   * O `autoplay` de um clipe frio só começa depois que ele carrega — ou seja,
   * DEPOIS de o mouse já ter assumido o comando. Sem um valor que os
   * manipuladores do vídeo possam ler na hora do evento, o vídeo saía tocando
   * por cima do gesto e o card ignorava o mouse.
   */
  const guiandoRef = useRef(false)

  const cancelar = (): void => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }

  // Desmontar com o timer armado (rolar a lista, trocar de personagem)
  // dispararia um `setState` num componente que já não existe.
  useEffect(() => cancelar, [])

  const entrar = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!clip || armado) return
    cancelar()
    origem.current = e.clientX
    timer.current = window.setTimeout(() => setArmado(true), ATRASO)
  }

  /**
   * Manda o vídeo pra posição pedida assim que ele estiver livre.
   *
   * O pedido só é CONSUMIDO quando dá pra cumprir. Consumir antes era o bug
   * do primeiro hover: com o arquivo frio, `duration` ainda é NaN quando o
   * mouse começa a andar, e a posição ia pro lixo — o card ficava mudo até
   * ele sair e voltar (aí o arquivo já estava em cache).
   *
   * E a pausa só entra JUNTO com a busca, nunca antes: um vídeo pausado
   * antes de carregar para de carregar, e ficava em `readyState 0` pra
   * sempre — parado no quadro zero por mais que o mouse andasse.
   */
  const aplicar = (): void => {
    const v = videoRef.current
    if (!v) return
    if (guiandoRef.current && !v.paused) v.pause()
    if (pendente.current === null) return
    if (v.seeking || !Number.isFinite(v.duration) || v.duration <= 0) return
    const alvo = pendente.current
    pendente.current = null
    if (!v.paused) v.pause()
    v.currentTime = alvo * v.duration
  }

  const mover = (e: React.PointerEvent<HTMLDivElement>): void => {
    const v = videoRef.current
    if (!v || !armado) return
    if (origem.current === null) origem.current = e.clientX
    // Antes do limiar isto ainda é "o mouse chegando", não um comando.
    if (!guiando && Math.abs(e.clientX - origem.current) < LIMIAR) return

    const r = e.currentTarget.getBoundingClientRect()
    const razao = entre((e.clientX - r.left) / r.width, 0, 1)
    if (!guiando) {
      guiandoRef.current = true
      setGuiando(true)
    }
    setProgresso(razao)
    // Guardar e aplicar quando livre: o mouse anda mais rápido do que o vídeo
    // busca, e mandar um `currentTime` por pixel deixaria a imagem travada
    // num quadro velho enquanto a fila de buscas se desenrola.
    pendente.current = razao
    aplicar()
  }

  const sair = (): void => {
    cancelar()
    setArmado(false)
    setTocando(false)
    setGuiando(false)
    guiandoRef.current = false
    setProgresso(0)
    origem.current = null
    pendente.current = null
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
      onPointerMove={mover}
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
          // "metadata", não "none": o que segura a enxurrada de vídeos é o
          // atraso pra MONTAR este elemento — quando ele existe, o clipe já é
          // pra carregar. Com "none", pausar pra guiar antes do primeiro byte
          // deixava o card congelado sem nunca buscar nada.
          preload="metadata"
          // `draggable={false}`: o arrasto pertence ao CARD, que sabe levar o
          // arquivo de verdade pro Windows. Deixar o vídeo capturar o gesto
          // faria o card virar inarrastável só por estar em prévia.
          draggable={false}
          // O clipe frio começa a tocar quando termina de carregar, e a essa
          // altura o mouse pode já ter assumido. Quem guia, manda.
          onPlay={aplicar}
          onPlaying={() => setTocando(true)}
          // Só aparece quando há quadro pra mostrar: guiando um clipe que
          // ainda não carregou, trocar a foto por um vídeo vazio daria preto.
          onLoadedData={() => setTocando(true)}
          // Chegou a duração: se o mouse já pediu uma posição, ela vale agora.
          onLoadedMetadata={aplicar}
          onDurationChange={aplicar}
          onCanPlay={aplicar}
          // O `seeked` é o que faz a última posição pedida valer: enquanto o
          // mouse corria, ela ficou guardada esperando o vídeo se soltar.
          onSeeked={() => {
            setTocando(true)
            aplicar()
          }}
          onTimeUpdate={(e) => {
            if (guiando) return
            const v = e.currentTarget
            if (Number.isFinite(v.duration) && v.duration > 0)
              setProgresso(v.currentTime / v.duration)
          }}
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
          {guiando ? 'guiando' : 'prévia'}
        </span>
      )}

      {/* A régua embaixo. Guiando, ela é a resposta do gesto: sem ela o mouse
          empurra a cena no escuro e não dá pra saber quanto sobrou de clipe. */}
      {tocando && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-black/45">
          <span
            className={cn('block h-full', guiando ? 'bg-primary' : 'bg-white/70')}
            style={{ width: `${entre(progresso, 0, 1) * 100}%` }}
          />
        </span>
      )}
    </div>
  )
}
